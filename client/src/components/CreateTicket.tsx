import { useState, useEffect, FormEvent } from 'react';
import { useDevContext } from '../contexts/DevContext.js';

interface Category {
  id: number;
  name: string;
}

interface RelatedSystem {
  id: number;
  name: string;
}

export function CreateTicket() {
  const { activeUser } = useDevContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [dropdownError, setDropdownError] = useState('');
  
  const [form, setForm] = useState({
    categoryId: '',
    relatedSystemId: '',
    summary: '',
    priority: 'Medium',
    description: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDropdowns = async () => {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      try {
        const [catRes, sysRes] = await Promise.all([
          fetch(`${API_URL}/api/categories`),
          fetch(`${API_URL}/api/related-systems`)
        ]);
        
        if (!catRes.ok || !sysRes.ok) {
          throw new Error('Failed to load dropdown data from the server.');
        }

        setCategories(await catRes.json());
        setSystems(await sysRes.json());
      } catch (err: any) {
        setDropdownError(err.message || 'Failed to load dropdowns.');
      } finally {
        setLoading(false);
      }
    };
    fetchDropdowns();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (errors[e.target.name]) {
      setErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess('');
    
    // validation
    const newErrors: Record<string, string> = {};
    if (!form.categoryId) newErrors.categoryId = "Category is required";
    if (!form.relatedSystemId) newErrors.relatedSystemId = "Related System is required";
    
    const trimmedSummary = form.summary.trim();
    if (!trimmedSummary) {
      newErrors.summary = "Summary is required";
    } else if (trimmedSummary.length > 100) {
      newErrors.summary = "Summary must be 100 characters or less";
    }

    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validPriorities.includes(form.priority)) {
      newErrors.priority = "Invalid priority selected";
    }

    const trimmedDescription = form.description.trim();
    if (!trimmedDescription) {
      newErrors.description = "Description is required";
    } else if (trimmedDescription.length > 1000) {
      newErrors.description = "Description must be 1000 characters or less";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!activeUser) {
      setErrors({ form: "You must be logged in to create a ticket." });
      return;
    }

    setSubmitting(true);
    setErrors({});
    
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${API_URL}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requester-Id': String(activeUser.id)
        },
        body: JSON.stringify(form)
      });
      
      if (!res.ok) {
        throw new Error('Failed to create ticket');
      }
      
      const resData = await res.json();
      setSuccess(`Ticket ${resData.ticketNumber} created successfully!`);
      setForm({
        categoryId: '',
        relatedSystemId: '',
        summary: '',
        priority: 'Medium',
        description: ''
      });
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading form data...</div>;

  return (
    <div className="card shadow-sm border-0 mt-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px', overflow: 'hidden' }}>
      <div className="card-header text-white border-0" style={{ backgroundColor: '#006B3C', padding: '1.5rem' }}>
        <h2 className="h4 mb-0 text-center">Create New IT Request</h2>
      </div>
      <div className="card-body p-4 p-md-5">
        {dropdownError && <div className="alert alert-danger" style={{ borderRadius: '15px' }}>{dropdownError}</div>}
        {success && <div className="alert alert-success" style={{ borderRadius: '15px' }}>{success}</div>}
        {errors.form && <div className="alert alert-danger" style={{ borderRadius: '15px' }}>{errors.form}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="row mb-4">
            <div className="col-md-6">
              <label htmlFor="categoryId" className="form-label fw-bold" style={{ color: '#006B3C' }}>Category <span className="text-danger">*</span></label>
              <select 
                id="categoryId"
                name="categoryId" 
                className={`form-select ${errors.categoryId ? 'is-invalid' : ''}`}
                style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
                value={form.categoryId}
                onChange={handleChange}
              >
                <option value="">-- Select Category --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.categoryId && <div className="invalid-feedback ms-3">{errors.categoryId}</div>}
            </div>
            
            <div className="col-md-6 mt-4 mt-md-0">
              <label htmlFor="relatedSystemId" className="form-label fw-bold" style={{ color: '#006B3C' }}>Related System <span className="text-danger">*</span></label>
              <select 
                id="relatedSystemId"
                name="relatedSystemId" 
                className={`form-select ${errors.relatedSystemId ? 'is-invalid' : ''}`}
                style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
                value={form.relatedSystemId}
                onChange={handleChange}
              >
                <option value="">-- Select System --</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {errors.relatedSystemId && <div className="invalid-feedback ms-3">{errors.relatedSystemId}</div>}
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-8">
              <label htmlFor="summary" className="form-label fw-bold" style={{ color: '#006B3C' }}>Summary <span className="text-danger">*</span></label>
              <input 
                id="summary"
                type="text" 
                name="summary" 
                className={`form-control ${errors.summary ? 'is-invalid' : ''}`}
                style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
                value={form.summary}
                onChange={handleChange}
                placeholder="Brief description of the issue"
              />
              {errors.summary && <div className="invalid-feedback ms-3">{errors.summary}</div>}
            </div>
            <div className="col-md-4 mt-4 mt-md-0">
              <label htmlFor="priority" className="form-label fw-bold" style={{ color: '#006B3C' }}>Priority <span className="text-danger">*</span></label>
              <select 
                id="priority"
                name="priority" 
                className={`form-select ${errors.priority ? 'is-invalid' : ''}`}
                style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
                value={form.priority}
                onChange={handleChange}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
              {errors.priority && <div className="invalid-feedback ms-3">{errors.priority}</div>}
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="description" className="form-label fw-bold" style={{ color: '#006B3C' }}>Description <span className="text-danger">*</span></label>
            <textarea 
              id="description"
              name="description" 
              rows={5}
              className={`form-control ${errors.description ? 'is-invalid' : ''}`}
              style={{ borderRadius: '15px', padding: '1rem 1.2rem' }}
              value={form.description}
              onChange={handleChange}
              placeholder="Detailed explanation of the request or problem..."
            />
            {errors.description && <div className="invalid-feedback ms-3">{errors.description}</div>}
          </div>

          <div className="d-flex justify-content-center">
            <button 
              type="submit" 
              className="btn btn-success px-5 py-3 fw-bold"
              style={{ backgroundColor: '#006B3C', borderColor: '#006B3C', borderRadius: '50rem', width: '100%', maxWidth: '300px' }}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
