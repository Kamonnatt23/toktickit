import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

interface Ticket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: string;
  priority: string;
  itPriority: string;
  createdAt: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requester: { id: number; name: string; email: string };
  owner: { id: number; name: string; email: string } | null;
}

interface StaffQueueProps {
  onTicketClick?: (id: number) => void;
}

export function StaffQueue({ onTicketClick }: StaffQueueProps) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [categoryId, setCategoryId] = useState('All');
  const [ownerId, setOwnerId] = useState('All');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
        const catRes = await fetch(`${API_URL}/api/categories`, { credentials: 'include' });
        
        if (catRes.ok) {
          setCategories(await catRes.json());
        }
      } catch (err) {
        console.error("Failed to load filters", err);
      }
    };
    loadFilters();
  }, []);

  const fetchTickets = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder
      });
      if (search) params.append('search', search);
      if (status && status !== 'All') params.append('status', status);
      if (categoryId && categoryId !== 'All') params.append('categoryId', categoryId);
      if (ownerId && ownerId !== 'All') params.append('ownerId', ownerId);

      const res = await fetch(`${API_URL}/api/staff/tickets?${params.toString()}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(`Error: ${res.status}`);
      }

      const data = await res.json();
      setTickets(data.data || []);
      setTotalPages(data.pagination.totalPages || 1);
      setTotal(data.pagination.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load tickets');
      setTickets([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [page, limit, sortBy, sortOrder, status, categoryId, ownerId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTickets();
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setStatus('All');
    setCategoryId('All');
    setOwnerId('All');
    setSearch('');
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'New': return 'bg-primary';
      case 'Open': return 'bg-primary';
      case 'Reopened': return 'bg-danger';
      case 'In Progress': return 'bg-info text-dark';
      case 'Waiting for Requester': return 'bg-warning text-dark';
      case 'Resolved': return 'bg-success';
      case 'Closed': return 'bg-secondary';
      default: return 'bg-secondary';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Low': return 'bg-secondary';
      case 'Medium': return 'bg-primary';
      case 'High': return 'bg-warning text-dark';
      case 'Critical': return 'bg-danger';
      default: return 'bg-secondary';
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <i className="bi bi-arrow-down-up ms-1 text-muted opacity-50" style={{ fontSize: '0.8rem' }}></i>;
    return sortOrder === 'asc' ? 
      <i className="bi bi-arrow-up ms-1 text-dark" style={{ fontSize: '0.8rem' }}></i> : 
      <i className="bi bi-arrow-down ms-1 text-dark" style={{ fontSize: '0.8rem' }}></i>;
  };

  if (!user || user.role === 'Requester') {
    return <div className="alert alert-danger">Access Denied</div>;
  }

  const renderPageNumbers = () => {
    let pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 3) {
        pages = [1, 2, 3, 4, '...', totalPages];
      } else if (page >= totalPages - 2) {
        pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        pages = [1, '...', page - 1, page, page + 1, '...', totalPages];
      }
    }
    
    return pages.map((p, idx) => (
      p === '...' ? (
        <span key={`ellipsis-${idx}`} className="btn btn-sm btn-outline-secondary disabled border-0 d-none d-sm-inline-block">...</span>
      ) : (
        <button 
          key={p} 
          className={`btn btn-sm ${page === p ? 'btn-secondary' : 'btn-outline-secondary'} d-none d-sm-inline-block`}
          onClick={() => setPage(p as number)}
        >
          {p}
        </button>
      )
    ));
  };

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white border-bottom-0 pt-4 pb-0 d-flex justify-content-between align-items-center">
        <h4 className="mb-0 fw-bold" style={{ color: '#006B3C' }}>Staff Ticket Queue</h4>
        <span className="badge bg-light text-dark border">{total} total tickets</span>
      </div>
      
      <div className="card-body">
        {error && <div className="alert alert-danger">{error}</div>}
        
        <form onSubmit={handleSearch} className="row g-2 mb-4">
          <div className="col-12 col-md-3">
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0"><i className="bi bi-search"></i></span>
              <input 
                type="text" 
                className="form-control border-start-0 ps-0 bg-light" 
                placeholder="Search ID or summary..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select bg-light" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="Open">Open</option>
              <option value="Reopened">Reopened</option>
              <option value="In Progress">In Progress</option>
              <option value="Waiting for Requester">Waiting for Requester</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select bg-light" value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select bg-light" value={ownerId} onChange={e => { setOwnerId(e.target.value); setPage(1); }}>
              <option value="All">All Assignees</option>
              <option value="Unassigned">Unassigned</option>
              {user && <option value={String(user.id)}>Assigned to Me</option>}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select bg-light" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
          <div className="col-12 col-md-1 d-flex align-items-center">
             <button type="button" className="btn btn-link text-secondary p-0" onClick={clearFilters}>Clear</button>
          </div>
        </form>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-5 bg-light rounded-3">
            <i className="bi bi-inbox fs-1 text-muted mb-3 d-block"></i>
            <h5 className="text-muted">No tickets found matching your criteria</h5>
            <button className="btn btn-outline-secondary mt-2" onClick={clearFilters}>Clear Filters</button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-responsive d-none d-md-block">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th scope="col" style={{ width: '10%' }}>ID</th>
                    <th scope="col" style={{ width: '25%' }}>Summary</th>
                    <th scope="col" style={{ width: '15%' }}>Category</th>
                    <th scope="col" style={{ width: '12%' }}>Requester</th>
                    <th scope="col" style={{ width: '10%', cursor: 'pointer' }} onClick={() => handleSort('itPriority')}>
                      IT Priority {renderSortIcon('itPriority')}
                    </th>
                    <th scope="col" style={{ width: '10%', cursor: 'pointer' }} onClick={() => handleSort('status')}>
                      Status {renderSortIcon('status')}
                    </th>
                    <th scope="col" style={{ width: '8%' }}>Owner</th>
                    <th scope="col" style={{ width: '10%', cursor: 'pointer' }} onClick={() => handleSort('createdAt')}>
                      Created {renderSortIcon('createdAt')}
                    </th>
                  </tr>
                </thead>
                <tbody style={{ borderTop: 'none' }}>
                  {tickets.map(ticket => (
                    <tr key={ticket.id} onClick={() => onTicketClick?.(ticket.id)} style={{ cursor: 'pointer' }}>
                      <td className="fw-medium text-secondary">{ticket.ticketNumber}</td>
                      <td className="fw-bold">{ticket.summary}</td>
                      <td><span className="badge bg-light text-dark border fw-normal">{ticket.category.name}</span></td>
                      <td className="text-truncate" style={{ maxWidth: '120px' }} title={ticket.requester.name}>{ticket.requester.name}</td>
                      <td><span className={`badge ${getPriorityBadge(ticket.itPriority)} fw-normal`}>{ticket.itPriority}</span></td>
                      <td><span className={`badge ${getStatusBadge(ticket.status)} fw-normal`}>{ticket.status}</span></td>
                      <td className="text-truncate" style={{ maxWidth: '100px' }} title={ticket.owner?.name || 'Unassigned'}>
                        {ticket.owner ? ticket.owner.name : <span className="text-muted fst-italic">Unassigned</span>}
                      </td>
                      <td className="text-muted small">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="d-md-none">
              {tickets.map(ticket => (
                <div key={ticket.id} className="card mb-3 shadow-sm" onClick={() => onTicketClick?.(ticket.id)} style={{ cursor: 'pointer' }}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-medium text-secondary small">{ticket.ticketNumber}</span>
                      <span className={`badge ${getStatusBadge(ticket.status)}`}>{ticket.status}</span>
                    </div>
                    <h6 className="card-title fw-bold mb-1">{ticket.summary}</h6>
                    <div className="d-flex justify-content-between align-items-center mt-3">
                       <span className={`badge ${getPriorityBadge(ticket.itPriority)} fw-normal`}>{ticket.itPriority}</span>
                       <span className="text-muted small">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="d-flex justify-content-between align-items-center mt-4">
              <span className="text-muted small">Page {page} of {totalPages || 1}</span>
              <div className="btn-group">
              <button 
                className="btn btn-sm btn-outline-secondary" 
                disabled={page <= 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              {renderPageNumbers()}
              <button 
                className="btn btn-sm btn-outline-secondary" 
                disabled={page >= totalPages} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
