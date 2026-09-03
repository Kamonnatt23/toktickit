import { useState, useEffect } from 'react';
import { useDevContext } from '../contexts/DevContext.js';

interface TicketDetailProps {
  ticketId: number;
  onBack: () => void;
}

export function TicketDetail({ ticketId, onBack }: TicketDetailProps) {
  const { activeUser } = useDevContext();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeUser) return;
    const fetchTicket = async () => {
      setLoading(true);
      setError('');
      try {
        const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
        const res = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
          headers: { 'X-Requester-Id': String(activeUser.id) }
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch ticket details');
        }
        
        setTicket(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTicket();
  }, [ticketId, activeUser]);

  if (loading) {
    return (
      <div className="card shadow-sm border-0 mt-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px', overflow: 'hidden' }}>
        <div className="card-body p-5 text-center">
          <div className="spinner-border text-success" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card shadow-sm border-0 mt-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px', overflow: 'hidden' }}>
        <div className="card-body p-5 text-center">
          <h4 className="text-danger mb-3">Error</h4>
          <p className="text-muted">{error}</p>
          <button className="btn btn-outline-success mt-3" style={{ borderRadius: '50rem' }} onClick={onBack}>
            Back to My Tickets
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="card shadow-sm border-0 mt-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px', overflow: 'hidden' }}>
      <div className="card-header border-0 d-flex justify-content-between align-items-center" style={{ backgroundColor: '#006B3C', padding: '1.5rem' }}>
        <h2 className="h4 mb-0 text-white fw-bold">Ticket Details</h2>
        <button className="btn btn-sm btn-light fw-bold" style={{ borderRadius: '50rem', color: '#006B3C' }} onClick={onBack}>
          ← Back to My Tickets
        </button>
      </div>
      
      <div className="card-body p-4 p-md-5">
        <div className="row mb-4">
          <div className="col-md-8">
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <span className="badge" style={{ backgroundColor: '#006B3C', fontSize: '1rem', padding: '0.5rem 1rem', borderRadius: '50rem' }}>
                {ticket.ticketNumber}
              </span>
              <span className="badge bg-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', borderRadius: '50rem' }}>
                {ticket.priority} Priority
              </span>
              <span className="badge bg-info" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', borderRadius: '50rem' }}>
                {ticket.status}
              </span>
            </div>
            <h3 className="fw-bolder mb-3" style={{ color: '#212529' }}>{ticket.summary}</h3>
          </div>
          <div className="col-md-4 text-md-end text-muted small">
            <p className="mb-0"><strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}</p>
          </div>
        </div>

        <div className="card border-0 mb-4 shadow-sm" style={{ backgroundColor: '#ffffff', borderRadius: '15px' }}>
          <div className="card-body p-4">
            <div className="row">
              <div className="col-sm-6 mb-3 mb-sm-0">
                <p className="text-muted mb-1 small fw-bold text-uppercase">Category</p>
                <p className="mb-0 fs-5">{ticket.category.name}</p>
              </div>
              <div className="col-sm-6">
                <p className="text-muted mb-1 small fw-bold text-uppercase">Related System</p>
                <p className="mb-0 fs-5">{ticket.relatedSystem.name}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <p className="text-muted mb-2 small fw-bold text-uppercase" style={{ color: '#006B3C' }}>Description</p>
          <div className="card border-0 shadow-sm" style={{ backgroundColor: '#ffffff', borderRadius: '15px' }}>
            <div className="card-body p-4" style={{ minHeight: '150px', whiteSpace: 'pre-wrap' }}>
              {ticket.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
