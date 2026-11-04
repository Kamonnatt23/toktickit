import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { CommunicationArea } from './CommunicationArea';
import { ActionsTaken } from './ActionsTaken';

interface StaffTicketDetailProps {
  ticketId: number;
  onBack: () => void;
}

const TRANSITION_MATRIX: Record<string, string[]> = {
  'New': ['Open', 'Cancelled'],
  'Open': ['In Progress', 'Waiting for Requester'],
  'Waiting for Requester': ['In Progress', 'Open'],
  'In Progress': ['Resolved', 'Waiting for Requester'],
  'Resolved': ['Closed'],
  'Closed': ['Reopened'],
  'Reopened': ['In Progress', 'Open', 'Waiting for Requester'],
  'Cancelled': []
};

const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-primary text-white',
  'Open': 'bg-primary text-white',
  'In Progress': 'bg-info text-dark',
  'Waiting for Requester': 'bg-warning text-dark',
  'Resolved': 'bg-success text-white',
  'Closed': 'bg-secondary text-white',
  'Reopened': 'bg-danger text-white',
  'Cancelled': 'bg-dark text-white'
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
  const [isConflict, setIsConflict] = useState(false);
  const [actionCount, setActionCount] = useState<number>(0);
  
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

  const fetchActionsCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setActionCount(data.length);
        }
      }
    } catch (err) {
      console.error('Failed to fetch actions count', err);
    }
  }, [ticketId, API_URL]);

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
    fetchActionsCount();
  }, [fetchTicket, fetchStaffUsers, fetchActionsCount]);

  const handleAssign = async (ownerId: number | null) => {
    if (assigning || !ticket?.updatedAt) return;
    setAssigning(true);
    setError('');
    setSuccessMsg('');
    setIsConflict(false);
    try {
      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ownerId,
          lastUpdatedAt: ticket.updatedAt
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setIsConflict(true);
          throw new Error(data.error || 'Ticket state was modified in another session. Please reload the latest ticket data and try again.');
        }
        throw new Error(data.error || 'Failed to assign ticket');
      }
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
    setIsConflict(false);
    try {
      const payload: any = {
        status: pendingStatus,
        lastUpdatedAt: ticket.updatedAt
      };
      if (['Cancelled', 'Reopened'].includes(pendingStatus)) payload.reason = transitionReason;
      if (['Waiting for Requester', 'Resolved'].includes(pendingStatus)) payload.comment = transitionComment;

      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setIsConflict(true);
          throw new Error(data.error || 'Ticket state was modified in another session. Your draft comment / reason has been preserved.');
        }
        throw new Error(data.error || 'Failed to update status');
      }
      setSuccessMsg('Status updated successfully');
      await fetchTicket();
      await fetchActionsCount();
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
    setIsConflict(false);
    try {
      const res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itPriority, lastUpdatedAt: ticket.updatedAt })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setIsConflict(true);
          throw new Error(data.error || 'Ticket state was modified in another session. Your draft comment / reason has been preserved.');
        }
        throw new Error(data.error || 'Failed to update priority');
      }
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
  const isTransitionValid = pendingStatus !== ticket.status && allowedTransitions.includes(pendingStatus);

  // Exact source-target owner requirement check
  const ownerRequired = Boolean(
    !ticket.ownerId && (
      (ticket.status === 'New' && pendingStatus === 'Open') ||
      (ticket.status === 'Open' && pendingStatus === 'In Progress') ||
      (ticket.status === 'Reopened' && pendingStatus === 'In Progress')
    )
  );

  // Resolution Gate validation (action count >= 1 is the sole mandatory condition)
  const isResolving = pendingStatus === 'Resolved';
  const isResolutionGateBlocked = isResolving && actionCount === 0;

  // Reason & comment requirements
  const requiresReason = isTransitionValid && (
    (pendingStatus === 'Cancelled' && ticket.status === 'New') ||
    (pendingStatus === 'Reopened' && ticket.status === 'Closed')
  );
  const requiresComment = isTransitionValid && pendingStatus === 'Waiting for Requester';

  const isSubmitDisabled =
    updatingStatus ||
    ownerRequired ||
    isResolutionGateBlocked ||
    (requiresReason && !transitionReason.trim()) ||
    (requiresComment && !transitionComment.trim());

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
        {error && !isConflict && (
          <div className="alert alert-danger alert-dismissible">
            <button type="button" className="btn-close" onClick={() => setError('')}></button>
            {error}
          </div>
        )}
        {isConflict && (
          <div className="alert alert-warning py-3 px-4 d-flex justify-content-between align-items-center mb-4">
            <div>
              <strong>Concurrency Notice: </strong>
              <span>{error || 'Ticket state was modified in another session. Your draft comment / reason has been preserved.'}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-dark text-nowrap ms-3"
              onClick={async () => {
                setIsConflict(false);
                setError('');
                await fetchTicket();
                await fetchActionsCount();
              }}
            >
              Reload Latest Data
            </button>
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success alert-dismissible">
            <button type="button" className="btn-close" onClick={() => setSuccessMsg('')}></button>
            {successMsg}
          </div>
        )}

        <div className="row g-4">
          <div className="col-md-8">
            <div className="bg-white p-4 rounded shadow-sm mb-4 border">
              <h6 className="text-muted fw-bold mb-3 text-uppercase" style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>Description</h6>
              <div className="text-dark" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
            </div>
            
            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="bg-white p-4 rounded shadow-sm border mb-4">
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
            
            <ActionsTaken
              ticketId={ticket.id}
              onTicketUpdated={async () => {
                await fetchTicket();
                await fetchActionsCount();
              }}
              onActionsLoaded={(count) => setActionCount(count)}
            />

            <CommunicationArea
              ticketId={ticket.id}
              ticketStatus={ticket.status}
              lastUpdatedAt={ticket.updatedAt}
              onUpdate={async () => {
                await fetchTicket();
                await fetchActionsCount();
              }}
            />
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
                  <select
                    className="form-select form-select-sm"
                    value={ticket.itPriority}
                    onChange={(e) => handlePriorityUpdate(e.target.value)}
                  >
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
                      <select
                        className="form-select form-select-sm me-2"
                        value={ticket.ownerId || ''}
                        onChange={(e) => handleAssign(e.target.value ? parseInt(e.target.value) : null)}
                        disabled={assigning}
                      >
                        <option value="">-- Unassigned --</option>
                        {staffUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} {u.id === user.id ? '(Me)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    {!ticket.ownerId && (
                      <button
                        className="btn btn-sm btn-outline-success w-100"
                        onClick={() => handleAssign(user.id)}
                        disabled={assigning}
                      >
                        Claim Ticket
                      </button>
                    )}
                  </div>
                ) : (
                  <div>{ticket.owner?.name || 'Unassigned'}</div>
                )}
              </div>

              {isStaff && allowedTransitions.length > 0 && (
                <div className="mb-3">
                  <label className="text-muted small fw-bold d-block mb-1">Update Status</label>
                  <select
                    className="form-select form-select-sm mb-2"
                    value={pendingStatus}
                    onChange={(e) => setPendingStatus(e.target.value)}
                    disabled={updatingStatus}
                    aria-label="Update ticket status"
                  >
                    <option value={ticket.status}>{ticket.status} (Current)</option>
                    {allowedTransitions.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  
                  {/* Owner Requirement Validation Feedback */}
                  {ownerRequired && (
                    <div className="alert alert-warning small py-2 mb-2" role="alert">
                      Ticket must be assigned to an owner before transitioning from '{ticket.status}' to '{pendingStatus}'.
                    </div>
                  )}

                  {/* Resolution Gate Feedback */}
                  {isResolutionGateBlocked && (
                    <div className="alert alert-warning small py-2 mb-2 d-flex justify-content-between align-items-center" role="alert">
                      <span>⚠️ Resolution Gate: At least one Action Taken must be recorded before resolving this ticket.</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-success p-0 ms-2 text-nowrap fw-bold"
                        onClick={() => {
                          const addBtn = document.querySelector<HTMLButtonElement>('[data-testid="add-action-taken-btn"]');
                          if (addBtn) addBtn.click();
                        }}
                      >
                        [+ Log Action Taken]
                      </button>
                    </div>
                  )}

                  {isResolving && !isResolutionGateBlocked && isTransitionValid && (
                    <div className="mb-2">
                      <label className="form-label small fw-bold mb-1">
                        Resolution Details (optional Public Comment explaining fix to requester)
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        placeholder="Explain the fix to the requester..."
                        value={transitionComment}
                        onChange={e => setTransitionComment(e.target.value)}
                        disabled={updatingStatus}
                      ></textarea>
                      <small className="text-muted d-block mt-1">
                        Optional: Explain the fix to the requester. If left blank, the ticket will be resolved without creating an empty comment.
                      </small>
                    </div>
                  )}

                  {isTransitionValid && requiresReason && (
                    <div className="mb-2">
                      <label className="form-label small fw-bold mb-1">
                        {pendingStatus === 'Cancelled' ? 'Cancellation Reason' : 'Reopen Reason'} <span className="text-danger">*</span>
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        placeholder={pendingStatus === 'Cancelled' ? 'Cancellation reason (required)' : 'Reopen reason (required)'}
                        value={transitionReason}
                        onChange={e => setTransitionReason(e.target.value)}
                        disabled={updatingStatus}
                        required
                      ></textarea>
                    </div>
                  )}

                  {isTransitionValid && requiresComment && (
                    <div className="mb-2">
                      <label className="form-label small fw-bold mb-1">
                        Public Comment <span className="text-danger">*</span>
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        placeholder="Public comment (required)"
                        value={transitionComment}
                        onChange={e => setTransitionComment(e.target.value)}
                        disabled={updatingStatus}
                        required
                      ></textarea>
                    </div>
                  )}
                  
                  {isTransitionValid && (
                    <button
                      className="btn btn-sm btn-primary w-100 mt-2"
                      onClick={handleStatusUpdate}
                      disabled={isSubmitDisabled}
                    >
                      {updatingStatus ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Updating...
                        </>
                      ) : (
                        'Confirm Status Change'
                      )}
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
