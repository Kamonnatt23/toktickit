import { useState, useEffect } from 'react';
import { useDevContext } from '../contexts/DevContext.js';

interface Ticket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: string;
  priority: string;
  createdAt: string;
  category: { name: string };
  relatedSystem: { name: string };
}

export function MyTickets() {
  const { activeUser } = useDevContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTickets = async () => {
    if (!activeUser) return;
    setLoading(true);
    setError('');
    
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const params = new URLSearchParams({
        page: String(page),
        limit: '5',
        sortBy,
        sortOrder
      });
      if (search) params.append('search', search);
      if (status && status !== 'All') params.append('status', status);

      const res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, {
        headers: { 'X-Requester-Id': String(activeUser.id) }
      });
      
      if (!res.ok) throw new Error('Failed to fetch tickets');
      
      const data = await res.json();
      setTickets(data.data);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [activeUser, page, sortBy, sortOrder, status]);

  // Debounced search
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      fetchTickets();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  if (!activeUser) return null;

  return (
    <div className="card shadow-sm border-0 mt-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px', overflow: 'hidden' }}>
      <div className="card-header text-white border-0" style={{ backgroundColor: '#006B3C', padding: '1.5rem' }}>
        <h2 className="h4 mb-0 text-center">My Tickets</h2>
      </div>
      <div className="card-body p-4 p-md-5">
        {error && <div className="alert alert-danger" style={{ borderRadius: '15px' }}>{error}</div>}

        <div className="row mb-4">
          <div className="col-md-4 mb-3 mb-md-0">
            <input 
              type="text" 
              className="form-control" 
              placeholder="Search by Ticket # or Summary" 
              style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-3 mb-3 mb-md-0">
            <select 
              className="form-select"
              style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="col-md-3 mb-3 mb-md-0">
            <select 
              className="form-select"
              style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            >
              <option value="createdAt">Sort by Date</option>
              <option value="priority">Sort by Priority</option>
              <option value="status">Sort by Status</option>
            </select>
          </div>
          <div className="col-md-2">
            <button 
              className="btn btn-outline-success w-100"
              style={{ borderRadius: '50rem', padding: '0.6rem 1.2rem' }}
              onClick={() => {
                setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                setPage(1);
              }}
            >
              {sortOrder === 'desc' ? 'Desc ↓' : 'Asc ↑'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-5">
            <h4 style={{ color: '#006B3C' }}>No tickets found!</h4>
            <p className="text-muted">Looks like you don't have any IT requests matching your criteria.</p>
          </div>
        ) : (
          <div>
            <div className="mb-3 text-muted fw-bold">Total Tickets: {total}</div>
            <div className="d-flex flex-column gap-3">
              {tickets.map(ticket => (
                <div key={ticket.id} className="card border-0 shadow-sm" style={{ borderRadius: '15px', backgroundColor: '#ffffff' }}>
                  <div className="card-body p-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <span className="badge" style={{ backgroundColor: '#006B3C', fontSize: '0.9rem', borderRadius: '50rem' }}>
                          {ticket.ticketNumber}
                        </span>
                        <span className="badge bg-secondary" style={{ borderRadius: '50rem' }}>
                          {ticket.priority} Priority
                        </span>
                        <span className="badge bg-info" style={{ borderRadius: '50rem' }}>
                          {ticket.status}
                        </span>
                      </div>
                      <h5 className="mb-1 fw-bold" style={{ color: '#212529' }}>{ticket.summary}</h5>
                      <p className="mb-0 text-muted small">
                        {ticket.category.name} | {ticket.relatedSystem.name} | {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="d-flex justify-content-center mt-4 gap-2">
                <button 
                  className="btn btn-outline-success"
                  style={{ borderRadius: '50rem', padding: '0.4rem 1.2rem' }}
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </button>
                <span className="d-flex align-items-center fw-bold text-success mx-2">
                  Page {page} of {totalPages}
                </span>
                <button 
                  className="btn btn-outline-success"
                  style={{ borderRadius: '50rem', padding: '0.4rem 1.2rem' }}
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
