import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

interface RequesterMetrics {
  openTickets: number;
  waitingForRequester: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

interface RecentTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: string;
  priority: string;
  itPriority?: string;
  updatedAt: string;
  createdAt: string;
  resolvedAt?: string;
}

interface RequesterDashboardProps {
  onNavigateToTickets?: (filters?: { view?: string; status?: string; withinDays?: number }) => void;
  onNavigateToCreate?: () => void;
  onTicketClick?: (id: number) => void;
}

export function RequesterDashboard({
  onNavigateToTickets,
  onNavigateToCreate,
  onTicketClick
}: RequesterDashboardProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<RequesterMetrics | null>(null);
  const [recentlyUpdatedTickets, setRecentlyUpdatedTickets] = useState<RecentTicket[]>([]);
  const [recentlyResolvedTickets, setRecentlyResolvedTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isForbidden, setIsForbidden] = useState(false);

  const fetchDashboard = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    setIsForbidden(false);

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${API_URL}/api/dashboard/requester`, {
        credentials: 'include'
      });

      if (res.status === 403) {
        setIsForbidden(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to load dashboard data.');
      }

      const data = await res.json();
      setMetrics(data.metrics);
      setRecentlyUpdatedTickets(data.recentlyUpdatedTickets || []);
      setRecentlyResolvedTickets(data.recentlyResolvedTickets || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'New': return 'badge bg-primary';
      case 'Open': return 'badge bg-primary';
      case 'Reopened': return 'badge bg-danger';
      case 'In Progress': return 'badge bg-info text-dark';
      case 'Waiting for Requester': return 'badge bg-warning text-dark';
      case 'Resolved': return 'badge bg-success';
      case 'Closed': return 'badge bg-secondary';
      default: return 'badge bg-secondary';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'badge bg-danger';
      case 'High': return 'badge bg-warning text-dark';
      case 'Medium': return 'badge bg-primary';
      case 'Low': return 'badge bg-secondary';
      default: return 'badge bg-secondary';
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Forbidden State
  if (isForbidden || (user && user.role !== 'Requester')) {
    return (
      <div className="card shadow-sm border-0 my-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px' }}>
        <div className="card-body p-5 text-center">
          <div className="text-danger mb-3" style={{ fontSize: '3rem' }}>
            <i className="bi bi-shield-x"></i>
          </div>
          <h3 className="h4 text-danger mb-2">Access Denied</h3>
          <p className="text-muted mb-4">
            Requester dashboard is available only to Requesters.
          </p>
          {onNavigateToTickets && (
            <button
              className="btn btn-success"
              style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: '#006B3C', borderColor: '#006B3C' }}
              onClick={() => onNavigateToTickets()}
            >
              Go to Ticket List
            </button>
          )}
        </div>
      </div>
    );
  }

  // Safe Failure State
  if (error) {
    return (
      <div className="my-4" role="status" aria-live="polite">
        <div className="alert alert-danger d-flex flex-column align-items-center p-4 shadow-sm" style={{ borderRadius: '15px' }}>
          <div className="d-flex align-items-center mb-3">
            <i className="bi bi-exclamation-triangle-fill fs-3 me-2 text-danger"></i>
            <span className="fw-semibold fs-5">{error}</span>
          </div>
          <button
            className="btn btn-outline-danger"
            style={{ borderRadius: '50rem', padding: '0.5rem 1.5rem' }}
            onClick={fetchDashboard}
          >
            <i className="bi bi-arrow-clockwise me-1"></i> Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if empty
  const isEmpty =
    !loading &&
    metrics &&
    metrics.openTickets === 0 &&
    metrics.waitingForRequester === 0 &&
    metrics.inProgress === 0 &&
    metrics.resolved === 0 &&
    metrics.closed === 0 &&
    recentlyUpdatedTickets.length === 0 &&
    recentlyResolvedTickets.length === 0;

  return (
    <div className="requester-dashboard">
      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: '#212529' }}>
          Welcome, {user?.name}!
        </h1>
        <p className="text-muted mb-0">Here's the latest on your IT service requests.</p>
      </div>

      {/* Operational Metric Cards (5 Cards across responsive grid) */}
      <div className="row g-3 mb-5">
        {/* Card 1: My Open Tickets */}
        <div className="col-12 col-md-6 col-xl">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">My Open Tickets</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1" style={{ color: '#006B3C' }}>
                    {metrics?.openTickets ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Active requests in progress</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small"
                  style={{ color: '#006B3C' }}
                  onClick={() => onNavigateToTickets?.({ view: 'open' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Action Required (Waiting on You) - High-salience amber accent border */}
        <div className="col-12 col-md-6 col-xl">
          <div
            className="card h-100 shadow-sm"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '18px',
              padding: '1.25rem',
              border: '2px solid #ffc107'
            }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">Action Required</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-warning">
                    {metrics?.waitingForRequester ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Waiting on your response</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-warning text-dark"
                  onClick={() => onNavigateToTickets?.({ status: 'Waiting for Requester' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: In Progress */}
        <div className="col-12 col-md-4 col-xl">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">In Progress</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-info">
                    {metrics?.inProgress ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Under IT investigation</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-info"
                  onClick={() => onNavigateToTickets?.({ status: 'In Progress' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Recently Resolved */}
        <div className="col-12 col-md-4 col-xl">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">Recently Resolved</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-success">
                    {metrics?.resolved ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Resolved within 30 days</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-success"
                  onClick={() => onNavigateToTickets?.({ status: 'Resolved', withinDays: 30 })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Closed */}
        <div className="col-12 col-md-4 col-xl">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">Closed</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-secondary">
                    {metrics?.closed ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Archived ticket history</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-secondary"
                  onClick={() => onNavigateToTickets?.({ status: 'Closed' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State Banner (if 0 tickets) */}
      {isEmpty && (
        <div
          className="card shadow-sm border-0 mb-5 text-center p-5"
          style={{ backgroundColor: '#fdfaf6', borderRadius: '20px' }}
        >
          <div className="mb-3" style={{ fontSize: '3rem', color: '#006B3C' }}>
            <i className="bi bi-inbox"></i>
          </div>
          <h2 className="h4 fw-bold mb-2" style={{ color: '#006B3C' }}>
            No tickets submitted yet. Need help? Create your first ticket!
          </h2>
          <p className="text-muted mb-4">
            You don't have any tickets yet. When you submit requests, you can track their real-time progress here.
          </p>
          <div>
            <button
              className="btn btn-success fw-bold"
              style={{
                borderRadius: '50rem',
                padding: '0.75rem 2.5rem',
                backgroundColor: '#006B3C',
                borderColor: '#006B3C'
              }}
              onClick={onNavigateToCreate}
            >
              + Create Ticket
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout (Recent Lists 65% / Quick Actions 35%) */}
      {!isEmpty && (
        <div className="row g-4">
          {/* Left Column (65% on Desktop): Two Structured Activity Lists */}
          <div className="col-12 col-xl-8">
            {/* List 1: Recently Updated Tickets */}
            <div
              className="card shadow-sm border-0 mb-4"
              style={{ backgroundColor: '#ffffff', borderRadius: '18px' }}
            >
              <div className="card-header bg-transparent border-0 pt-4 px-4 pb-2">
                <h2 className="h5 fw-bold mb-0" style={{ color: '#212529' }}>
                  Recently Updated Tickets
                </h2>
              </div>
              <div className="card-body p-4 pt-2">
                {loading ? (
                  <div className="placeholder-glow" role="status">
                    <div className="placeholder col-12 mb-3 py-3 rounded"></div>
                    <div className="placeholder col-12 mb-3 py-3 rounded"></div>
                    <div className="placeholder col-12 py-3 rounded"></div>
                  </div>
                ) : recentlyUpdatedTickets.length === 0 ? (
                  <div className="text-muted text-center py-4">No recently updated tickets found.</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {recentlyUpdatedTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="list-group-item list-group-item-action px-2 py-3 border-bottom d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 cursor-pointer"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onTicketClick?.(ticket.id)}
                      >
                        <div className="me-auto">
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <span className="fw-bold text-success">{ticket.ticketNumber}</span>
                            <span className={getStatusBadge(ticket.status)}>{ticket.status}</span>
                            <span className={getPriorityBadge(ticket.priority)}>{ticket.priority}</span>
                          </div>
                          <div className="text-dark fw-medium">{ticket.summary}</div>
                        </div>
                        <div className="text-muted small text-nowrap">
                          Updated {formatDateTime(ticket.updatedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* List 2: Recently Resolved Tickets (30-Day Boundary) */}
            <div
              className="card shadow-sm border-0 mb-4"
              style={{ backgroundColor: '#ffffff', borderRadius: '18px' }}
            >
              <div className="card-header bg-transparent border-0 pt-4 px-4 pb-2">
                <h2 className="h5 fw-bold mb-0" style={{ color: '#212529' }}>
                  Recently Resolved Tickets
                </h2>
              </div>
              <div className="card-body p-4 pt-2">
                {loading ? (
                  <div className="placeholder-glow" role="status">
                    <div className="placeholder col-12 mb-3 py-3 rounded"></div>
                    <div className="placeholder col-12 py-3 rounded"></div>
                  </div>
                ) : recentlyResolvedTickets.length === 0 ? (
                  <div className="text-muted text-center py-4">No tickets resolved in the last 30 days.</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {recentlyResolvedTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="list-group-item list-group-item-action px-2 py-3 border-bottom cursor-pointer"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onTicketClick?.(ticket.id)}
                      >
                        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold text-success">{ticket.ticketNumber}</span>
                            <span className="text-dark fw-medium">{ticket.summary}</span>
                          </div>
                          <div className="text-muted small text-nowrap">
                            Resolved {ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : ''}
                          </div>
                        </div>
                        <div className="small text-secondary fst-italic">
                          Issue resolved? If problem persists, open ticket and reply to reopen.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (35% on Desktop): Quick Actions */}
          <div className="col-12 col-xl-4">
            <div
              className="card shadow-sm border-0 mb-4"
              style={{ backgroundColor: '#fdfaf6', borderRadius: '18px' }}
            >
              <div className="card-header bg-transparent border-0 pt-4 px-4 pb-2">
                <h2 className="h5 fw-bold mb-0" style={{ color: '#006B3C' }}>
                  Quick Actions
                </h2>
              </div>
              <div className="card-body p-4 pt-2 d-flex flex-column gap-3">
                <button
                  className="btn btn-success fw-bold w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                  style={{
                    borderRadius: '50rem',
                    backgroundColor: '#006B3C',
                    borderColor: '#006B3C'
                  }}
                  onClick={onNavigateToCreate}
                >
                  <i className="bi bi-plus-lg"></i> + Create Ticket
                </button>
                <button
                  className="btn btn-outline-success fw-bold w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                  style={{
                    borderRadius: '50rem',
                    color: '#006B3C',
                    borderColor: '#006B3C'
                  }}
                  onClick={() => onNavigateToTickets?.()}
                >
                  <i className="bi bi-card-list"></i> View My Tickets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
