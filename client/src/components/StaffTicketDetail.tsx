import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { CommunicationArea } from './CommunicationArea';

interface StaffTicketDetailProps {
  ticketId: number;
  onBack: () => void;
}

const TRANSITION_MATRIX: Record<string, string[]> = {
  'New': ['Open', 'Cancelled'],
  'Open': ['In Progress', 'Waiting for Requester'],
  'Waiting for Requester': ['Open', 'In Progress'],
  'In Progress': ['Resolved', 'Waiting for Requester'],
  'Resolved': ['Closed'],
  'Closed': ['Reopened'],
  'Cancelled': []
};

const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-info text-dark',
  'Open': 'bg-primary',
  'In Progress': 'bg-warning text-dark',
  'Waiting for Requester': 'bg-secondary',
  'Resolved': 'bg-success',
  'Closed': 'bg-dark',
  'Cancelled': 'bg-danger'
};

const PRIORITY_COLORS: Record<string, string> = {
  'Low': 'text-secondary',
  'Medium': 'text-primary',
  'High': 'text-warning',
  'Critical': 'text-danger'
};

export function StaffTicketDetail({ ticketId, onBack }: StaffTicketDetailProps) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Operation states
  const [assigning, setAssigning] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  // Pending updates
  const [pendingStatus, setPendingStatus] = useState('');
  const [transitionComment, setTransitionComment] = useState('');
  const [transitionReason, setTransitionReason] = useState('');

  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  const fetchTicket = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ticket');
      setTicket(data);
      setPendingStatus(data.status);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [ticketId, user, API_URL]);

  const fetchStaffUsers = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/api/staff/users`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        setStaffUsers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff users', err);
    }
  }, [user, API_URL]);

  useEffect(() => {
    fetchTicket();
    fetchStaffUsers();
  }, [fetchTicket, fetchStaffUsers]);

  const handleAssign = async (ownerId: number | null) => {
    setAssigning(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ownerId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign ticket');
      setSuccessMsg('Ticket assigned successfully');
      await fetchTicket();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusUpdate = async () => {
    setUpdatingStatus(true);
    setError('');
    setSuccessMsg('');
    try {
      const payload: any = { status: pendingStatus };
      if (pendingStatus === 'Cancelled') payload.reason = transitionReason;
      if (['Waiting for Requester', 'Resolved'].includes(pendingStatus)) payload.comment = transitionComment;

      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setSuccessMsg('Status updated successfully');
      await fetchTicket();
      setTransitionComment('');
      setTransitionReason('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityUpdate = async (itPriority: string) => {
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itPriority })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update priority');
      setSuccessMsg('Priority updated successfully');
      await fetchTicket();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  if (error && !ticket) return <div className="alert alert-danger">{error}</div>;
  if (!ticket) return <div className="text-center py-5"><h4>Ticket not found</h4></div>;

  const isStaff = user?.role === 'IT Staff';
  const allowedTransitions = TRANSITION_MATRIX[ticket.status] || [];
  const requiresReason = pendingStatus === 'Cancelled' && ticket.status === 'New';
  const requiresComment = ['Waiting for Requester', 'Resolved'].includes(pendingStatus) && pendingStatus !== ticket.status;
  const isTransitionValid = pendingStatus !== ticket.status;

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white border-bottom pb-0 pt-3 px-4 d-flex justify-content-between align-items-center">
        <div>
          <button className="btn btn-link text-success text-decoration-none p-0 mb-2" onClick={onBack}>
            <i className="bi bi-arrow-left me-2"></i>Back to Queue
          </button>
          <h4 className="fw-bold mb-3">
            <span className="text-secondary me-2">{ticket.ticketNumber || `TKT-${ticket.id.toString().padStart(4, '0')}`}</span>
            {ticket.summary}
          </h4>
        </div>
        <div className="text-end">
          <span className={`badge ${STATUS_COLORS[ticket.status] || 'bg-secondary'} fs-6 py-2 px-3`}>{ticket.status}</span>
        </div>
      </div>

      <div className="card-body p-4 bg-light">
        {error && <div className="alert alert-danger alert-dismissible"><button type="button" className="btn-close" onClick={() => setError('')}></button>{error}</div>}
        {successMsg && <div className="alert alert-success alert-dismissible"><button type="button" className="btn-close" onClick={() => setSuccessMsg('')}></button>{successMsg}</div>}

        <div className="row g-4">
          <div className="col-md-8">
            <div className="bg-white p-4 rounded shadow-sm mb-4 border">
              <h6 className="text-muted fw-bold mb-3 text-uppercase" style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>Description</h6>
              <div className="text-dark" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
            </div>
            
            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="bg-white p-4 rounded shadow-sm border">
                <h6 className="text-muted fw-bold mb-3 text-uppercase" style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>Attachments</h6>
                <ul className="list-group list-group-flush">
                  {ticket.attachments.filter((a: any) => !a.isDeleted).map((att: any) => (
                    <li key={att.id} className="list-group-item px-0 d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center">
                        <i className="bi bi-paperclip me-2 text-secondary"></i>
                        <span>{att.fileName}</span>
                      </div>
                      <a href={`${API_URL}/api/attachments/${att.id}/download`} className="btn btn-sm btn-outline-primary" download>Download</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <CommunicationArea ticketId={ticket.id} ticketStatus={ticket.status} onUpdate={fetchTicket} />
          </div>
          
          <div className="col-md-4">
            <div className="bg-white p-4 rounded shadow-sm border">
              <h6 className="text-muted fw-bold mb-4 text-uppercase" style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>Ticket Details</h6>
              
              <div className="mb-3 pb-3 border-bottom">
                <label className="text-muted small fw-bold d-block mb-1">Requester</label>
                <div>{ticket.requester.name}</div>
                <div className="text-secondary small">{ticket.requester.email}</div>
              </div>
              
              <div className="mb-3 pb-3 border-bottom">
                <label className="text-muted small fw-bold d-block mb-1">Category & System</label>
                <div>{ticket.category.name}</div>
                <div className="text-secondary small">{ticket.relatedSystem.name}</div>
              </div>
              
              <div className="mb-3 pb-3 border-bottom">
                <label className="text-muted small fw-bold d-block mb-1">Requested Priority</label>
                <div>{ticket.priority}</div>
              </div>

              <div className="mb-3 pb-3 border-bottom">
                <label className="text-muted small fw-bold d-block mb-1">IT Priority</label>
                {isStaff ? (
                  <select className="form-select form-select-sm" value={ticket.itPriority} onChange={(e) => handlePriorityUpdate(e.target.value)}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                ) : (
                  <div className={`fw-bold ${PRIORITY_COLORS[ticket.itPriority] || 'text-dark'}`}>{ticket.itPriority}</div>
                )}
              </div>
              
              <div className="mb-3 pb-3 border-bottom">
                <label className="text-muted small fw-bold d-block mb-1">Assignment</label>
                {isStaff ? (
                  <div>
                    <div className="d-flex mb-2">
                      <select className="form-select form-select-sm me-2" value={ticket.ownerId || ''} onChange={(e) => handleAssign(e.target.value ? parseInt(e.target.value) : null)} disabled={assigning}>
                        <option value="">-- Unassigned --</option>
                        {staffUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} {u.id === user.id ? '(Me)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    {!ticket.ownerId && (
                      <button className="btn btn-sm btn-outline-success w-100" onClick={() => handleAssign(user.id)} disabled={assigning}>Claim Ticket</button>
                    )}
                  </div>
                ) : (
                  <div>{ticket.owner?.name || 'Unassigned'}</div>
                )}
              </div>

              {isStaff && allowedTransitions.length > 0 && (
                <div className="mb-3">
                  <label className="text-muted small fw-bold d-block mb-1">Update Status</label>
                  <select className="form-select form-select-sm mb-2" value={pendingStatus} onChange={(e) => setPendingStatus(e.target.value)} disabled={updatingStatus}>
                    <option value={ticket.status}>{ticket.status} (Current)</option>
                    {allowedTransitions.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  
                  {isTransitionValid && requiresReason && (
                    <div className="mb-2">
                      <textarea className="form-control form-control-sm" placeholder="Cancellation reason (required)" value={transitionReason} onChange={e => setTransitionReason(e.target.value)}></textarea>
                    </div>
                  )}
                  {isTransitionValid && requiresComment && (
                    <div className="mb-2">
                      <textarea className="form-control form-control-sm" placeholder="Public comment (required)" value={transitionComment} onChange={e => setTransitionComment(e.target.value)}></textarea>
                    </div>
                  )}
                  
                  {isTransitionValid && (
                    <button className="btn btn-sm btn-primary w-100" onClick={handleStatusUpdate} disabled={updatingStatus || (requiresReason && !transitionReason.trim()) || (requiresComment && !transitionComment.trim())}>
                      {updatingStatus ? 'Updating...' : 'Confirm Status Change'}
                    </button>
                  )}
                </div>
              )}
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
