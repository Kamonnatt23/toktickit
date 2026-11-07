import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

interface StaffMetrics {
  unassigned: number;
  myAssigned: number;
  new: number;
  open: number;
  inProgress: number;
  waitingForRequester: number;
}

interface PriorityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface UserStats {
  totalUsers: number;
  activeRequesters: number;
  activeStaff: number;
  activeAdmins: number;
  inactiveUsers: number;
}

interface RecentTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: string;
  priority: string;
  itPriority?: string;
  owner: { id: number; name: string } | null;
  requester: { id: number; name: string } | null;
  updatedAt: string;
}

interface StaffDashboardProps {
  onNavigateToQueue?: (filters?: {
    ownerId?: string;
    status?: string;
    itPriority?: string;
    scope?: string;
    focusSearch?: boolean;
  }) => void;
  onNavigateToUsers?: () => void;
  onTicketClick?: (id: number) => void;
}

export function StaffDashboard({
  onNavigateToQueue,
  onNavigateToUsers,
  onTicketClick
}: StaffDashboardProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<StaffMetrics | null>(null);
  const [priorityBreakdown, setPriorityBreakdown] = useState<PriorityBreakdown | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
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
      const endpoint = user.role === 'Administrator' ? '/api/dashboard/admin' : '/api/dashboard/staff';
      const res = await fetch(`${API_URL}${endpoint}`, {
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
      if (user.role === 'Administrator') {
        setMetrics(data.staffMetrics);
        setUserStats(data.userStats);
      } else {
        setMetrics(data.metrics);
      }
      setPriorityBreakdown(data.priorityBreakdown || { critical: 0, high: 0, medium: 0, low: 0 });
      setRecentTickets(data.recentTickets || []);
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
  if (isForbidden || (user && user.role === 'Requester')) {
    return (
      <div className="card shadow-sm border-0 my-4" style={{ backgroundColor: '#fdfaf6', borderRadius: '20px' }}>
        <div className="card-body p-5 text-center">
          <div className="text-danger mb-3" style={{ fontSize: '3rem' }}>
            <i className="bi bi-shield-x"></i>
          </div>
          <h3 className="h4 text-danger mb-2">Access Denied</h3>
          <p className="text-muted mb-4">
            Staff dashboard is available only to IT Staff and Administrators.
          </p>
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
            <i className="bi bi-arrow-clockwise me-1"></i> Retry Loading Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isQueueEmpty =
    !loading &&
    metrics &&
    metrics.unassigned === 0 &&
    metrics.myAssigned === 0 &&
    metrics.new === 0 &&
    metrics.open === 0 &&
    metrics.inProgress === 0 &&
    metrics.waitingForRequester === 0 &&
    recentTickets.length === 0;

  return (
    <div className="staff-dashboard">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1" style={{ color: '#212529' }}>
            Welcome back, {user?.name}!
          </h1>
          <p className="text-muted mb-0">Here's what's happening with your queue today.</p>
        </div>
        <button
          className="btn btn-outline-success rounded-circle d-flex align-items-center justify-content-center shadow-sm"
          style={{ width: '45px', height: '45px', borderColor: '#006B3C', color: '#006B3C' }}
          onClick={fetchDashboard}
          aria-label="Refresh dashboard data"
          title="Refresh dashboard data"
          disabled={loading}
        >
          <i className={`bi bi-arrow-clockwise fs-5 ${loading ? 'spinner-border spinner-border-sm' : ''}`}></i>
        </button>
      </div>

      {/* Operational Metric Cards (6 Cards across responsive grid) */}
      <div className="row g-3 mb-4">
        {/* Card 1: Unassigned - High-salience card with purple/amber accent border */}
        <div className="col-12 col-md-4 col-xl-2">
          <div
            className="card h-100 shadow-sm"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '18px',
              padding: '1.25rem',
              border: '2px solid #6f42c1'
            }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="fw-semibold small text-uppercase" style={{ color: '#6f42c1' }}>Unassigned</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1" style={{ color: '#6f42c1' }}>
                    {metrics?.unassigned ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Needs triage/owner</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small"
                  style={{ color: '#6f42c1' }}
                  onClick={() => onNavigateToQueue?.({ ownerId: 'Unassigned' })}
                  disabled={loading}
                >
                  Assign queue &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: My Assigned */}
        <div className="col-12 col-md-4 col-xl-2">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">My Assigned</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-primary">
                    {metrics?.myAssigned ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Active to you</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-primary"
                  onClick={() => onNavigateToQueue?.({ ownerId: String(user?.id) })}
                  disabled={loading}
                >
                  My tickets &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: New */}
        <div className="col-12 col-md-4 col-xl-2">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">New</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-info">
                    {metrics?.new ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Newly reported</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-info"
                  onClick={() => onNavigateToQueue?.({ status: 'New' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Open */}
        <div className="col-12 col-md-4 col-xl-2">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">Open</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1" style={{ color: '#006B3C' }}>
                    {metrics?.open ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Ready for work</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small"
                  style={{ color: '#006B3C' }}
                  onClick={() => onNavigateToQueue?.({ status: 'Open' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: In Progress */}
        <div className="col-12 col-md-4 col-xl-2">
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
                  <div className="fs-1 fw-bolder my-1 text-warning">
                    {metrics?.inProgress ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">Under service</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-warning"
                  onClick={() => onNavigateToQueue?.({ status: 'In Progress' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 6: Waiting for Requester */}
        <div className="col-12 col-md-4 col-xl-2">
          <div
            className="card h-100 shadow-sm border-0"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '1.25rem' }}
          >
            <div className="card-body p-0 d-flex flex-column justify-content-between">
              <div>
                <span className="text-muted fw-semibold small text-uppercase">Waiting</span>
                {loading ? (
                  <div className="placeholder-glow my-2" role="status">
                    <span className="placeholder col-6 fs-1"></span>
                  </div>
                ) : (
                  <div className="fs-1 fw-bolder my-1 text-secondary">
                    {metrics?.waitingForRequester ?? 0}
                  </div>
                )}
                <div className="small text-muted mb-3">On customer reply</div>
              </div>
              <div>
                <button
                  className="btn btn-link p-0 text-decoration-none fw-semibold small text-secondary"
                  onClick={() => onNavigateToQueue?.({ status: 'Waiting for Requester' })}
                  disabled={loading}
                >
                  View all &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Priority Distribution */}
      <div
        className="card shadow-sm border-0 mb-4"
        style={{ backgroundColor: '#fdfaf6', borderRadius: '18px' }}
      >
        <div className="card-body p-3 px-4 d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
          <span className="fw-bold small text-uppercase" style={{ color: '#006B3C', letterSpacing: '0.05em' }}>
            Active Priority Distribution:
          </span>
          <div className="d-flex flex-wrap gap-2">
            {loading ? (
              <div className="placeholder-glow" role="status">
                <span className="placeholder col-3 me-2" style={{ width: '80px', height: '30px', borderRadius: '50rem' }}></span>
                <span className="placeholder col-3 me-2" style={{ width: '80px', height: '30px', borderRadius: '50rem' }}></span>
                <span className="placeholder col-3 me-2" style={{ width: '80px', height: '30px', borderRadius: '50rem' }}></span>
                <span className="placeholder col-3" style={{ width: '80px', height: '30px', borderRadius: '50rem' }}></span>
              </div>
            ) : (
              <>
                <button
                  className="btn btn-sm btn-danger fw-semibold d-flex align-items-center gap-2"
                  style={{ borderRadius: '50rem', padding: '0.35rem 1rem' }}
                  onClick={() => onNavigateToQueue?.({ itPriority: 'Critical', scope: 'active' })}
                >
                  <span>Critical</span>
                  <span className="badge bg-white text-danger rounded-pill">
                    {priorityBreakdown?.critical ?? 0}
                  </span>
                </button>
                <button
                  className="btn btn-sm btn-warning fw-semibold d-flex align-items-center gap-2 text-dark"
                  style={{ borderRadius: '50rem', padding: '0.35rem 1rem' }}
                  onClick={() => onNavigateToQueue?.({ itPriority: 'High', scope: 'active' })}
                >
                  <span>High</span>
                  <span className="badge bg-dark text-white rounded-pill">
                    {priorityBreakdown?.high ?? 0}
                  </span>
                </button>
                <button
                  className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2"
                  style={{ borderRadius: '50rem', padding: '0.35rem 1rem' }}
                  onClick={() => onNavigateToQueue?.({ itPriority: 'Medium', scope: 'active' })}
                >
                  <span>Medium</span>
                  <span className="badge bg-white text-primary rounded-pill">
                    {priorityBreakdown?.medium ?? 0}
                  </span>
                </button>
                <button
                  className="btn btn-sm btn-secondary fw-semibold d-flex align-items-center gap-2"
                  style={{ borderRadius: '50rem', padding: '0.35rem 1rem' }}
                  onClick={() => onNavigateToQueue?.({ itPriority: 'Low', scope: 'active' })}
                >
                  <span>Low</span>
                  <span className="badge bg-white text-dark rounded-pill">
                    {priorityBreakdown?.low ?? 0}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Administrator User Administration Summary Card */}
      {user?.role === 'Administrator' && (
        <div
          className="card shadow-sm border-0 mb-4"
          style={{ backgroundColor: '#ffffff', borderRadius: '18px' }}
        >
          <div className="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex justify-content-between align-items-center">
            <h2 className="h5 fw-bold mb-0" style={{ color: '#212529' }}>
              User Administration Summary
            </h2>
            {onNavigateToUsers && (
              <button
                className="btn btn-link p-0 text-decoration-none fw-semibold"
                style={{ color: '#006B3C' }}
                onClick={onNavigateToUsers}
              >
                Manage Users &rarr;
              </button>
            )}
          </div>
          <div className="card-body p-4 pt-2">
            {loading ? (
              <div className="placeholder-glow row g-3" role="status">
                <div className="col-6 col-md"><div className="placeholder col-12 py-3 rounded"></div></div>
                <div className="col-6 col-md"><div className="placeholder col-12 py-3 rounded"></div></div>
                <div className="col-6 col-md"><div className="placeholder col-12 py-3 rounded"></div></div>
                <div className="col-6 col-md"><div className="placeholder col-12 py-3 rounded"></div></div>
                <div className="col-6 col-md"><div className="placeholder col-12 py-3 rounded"></div></div>
              </div>
            ) : (
              <div className="row g-3 text-center">
                <div className="col-6 col-md">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="fs-2 fw-bold" style={{ color: '#006B3C' }}>
                      {userStats?.totalUsers ?? 0}
                    </div>
                    <div className="small text-muted fw-semibold">Total Users</div>
                  </div>
                </div>
                <div className="col-6 col-md">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="fs-2 fw-bold text-primary">
                      {userStats?.activeRequesters ?? 0}
                    </div>
                    <div className="small text-muted fw-semibold">Active Requesters</div>
                  </div>
                </div>
                <div className="col-6 col-md">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="fs-2 fw-bold text-success">
                      {userStats?.activeStaff ?? 0}
                    </div>
                    <div className="small text-muted fw-semibold">Active Staff</div>
                  </div>
                </div>
                <div className="col-6 col-md">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="fs-2 fw-bold text-info">
                      {userStats?.activeAdmins ?? 0}
                    </div>
                    <div className="small text-muted fw-semibold">Active Admins</div>
                  </div>
                </div>
                <div className="col-6 col-md">
                  <div className="p-3 rounded-3" style={{ backgroundColor: '#f8f9fa' }}>
                    <div className="fs-2 fw-bold text-secondary">
                      {userStats?.inactiveUsers ?? 0}
                    </div>
                    <div className="small text-muted fw-semibold">Inactive Accounts</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Two-Column Layout (Queue 65% / Quick Actions 35%) */}
      <div className="row g-4">
        {/* Left Column (65% on Desktop): Recently Updated Queue */}
        <div className="col-12 col-xl-8">
          <div
            className="card shadow-sm border-0 mb-4"
            style={{ backgroundColor: '#ffffff', borderRadius: '18px' }}
          >
            <div className="card-header bg-transparent border-0 pt-4 px-4 pb-2">
              <h2 className="h5 fw-bold mb-0" style={{ color: '#212529' }}>
                Recently Updated Queue
              </h2>
            </div>
            <div className="card-body p-4 pt-2">
              {loading ? (
                <div className="placeholder-glow" role="status">
                  <div className="placeholder col-12 mb-3 py-3 rounded"></div>
                  <div className="placeholder col-12 mb-3 py-3 rounded"></div>
                  <div className="placeholder col-12 py-3 rounded"></div>
                </div>
              ) : isQueueEmpty ? (
                <div className="alert alert-success text-center py-4 my-2 border-0" style={{ borderRadius: '15px' }}>
                  <i className="bi bi-check-circle-fill fs-3 text-success d-block mb-2"></i>
                  <span className="fw-semibold">
                    No active tickets in queue. Great job! All issues are currently resolved.
                  </span>
                </div>
              ) : recentTickets.length === 0 ? (
                <div className="text-muted text-center py-4">No tickets in queue.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th scope="col" className="border-0">Ticket #</th>
                        <th scope="col" className="border-0">Summary</th>
                        <th scope="col" className="border-0">Status</th>
                        <th scope="col" className="border-0">IT Priority</th>
                        <th scope="col" className="border-0">Assigned Owner</th>
                        <th scope="col" className="border-0 text-end">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTickets.map((ticket) => (
                        <tr
                          key={ticket.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => onTicketClick?.(ticket.id)}
                        >
                          <td className="fw-bold text-success text-nowrap">{ticket.ticketNumber}</td>
                          <td className="fw-medium text-dark">{ticket.summary}</td>
                          <td>
                            <span className={getStatusBadge(ticket.status)}>{ticket.status}</span>
                          </td>
                          <td>
                            <span className={getPriorityBadge(ticket.itPriority || ticket.priority)}>
                              {ticket.itPriority || ticket.priority}
                            </span>
                          </td>
                          <td className="text-muted small">
                            {ticket.owner?.name ? (
                              <span>{ticket.owner.name}</span>
                            ) : (
                              <span className="badge bg-light text-secondary border">Unassigned</span>
                            )}
                          </td>
                          <td className="text-muted small text-end text-nowrap">
                            {formatDateTime(ticket.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (35% on Desktop): Quick Actions (Authorized Staff Actions Only) */}
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
                className="btn btn-outline-success fw-bold w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                style={{
                  borderRadius: '50rem',
                  borderColor: '#006B3C',
                  color: '#006B3C'
                }}
                onClick={() => onNavigateToQueue?.({ focusSearch: true })}
              >
                <i className="bi bi-search"></i> Search Tickets
              </button>
              <button
                className="btn btn-outline-primary fw-bold w-100 py-2 d-flex align-items-center justify-content-center gap-2"
                style={{ borderRadius: '50rem' }}
                onClick={() => onNavigateToQueue?.({ ownerId: String(user?.id) })}
              >
                <i className="bi bi-person-check"></i> My Queue
              </button>
              <button
                className="btn fw-bold w-100 py-2 d-flex align-items-center justify-content-center gap-2 text-white"
                style={{
                  borderRadius: '50rem',
                  backgroundColor: '#6f42c1',
                  borderColor: '#6f42c1'
                }}
                onClick={() => onNavigateToQueue?.({ ownerId: 'Unassigned' })}
              >
                <i className="bi bi-inbox-fill"></i> Unassigned Queue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
