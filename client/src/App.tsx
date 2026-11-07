import { useState, useEffect } from 'react';
import { SystemStatus } from "./components/SystemStatus";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Login";
import { ChangePassword } from "./components/ChangePassword";
import { CreateTicket } from "./components/CreateTicket";
import { MyTickets } from "./components/MyTickets";
import { TicketDetail } from "./components/TicketDetail";
import { StaffQueue } from "./components/StaffQueue";
import { StaffTicketDetail } from "./components/StaffTicketDetail";
import UserManagement from "./components/UserManagement";
import { RequesterDashboard } from "./components/RequesterDashboard";
import { StaffDashboard } from "./components/StaffDashboard";

function AppContent() {
  const { user, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'list' | 'detail' | 'queue' | 'users'>('create');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [myTicketsInitialFilter, setMyTicketsInitialFilter] = useState<{ view?: string; status?: string; withinDays?: number } | null>(null);
  const [staffQueueInitialFilter, setStaffQueueInitialFilter] = useState<{ ownerId?: string; status?: string; itPriority?: string; scope?: string; focusSearch?: boolean } | null>(null);

  useEffect(() => {
    if (user) {
      if (user.role === 'IT Staff' && activeTab === 'create') setActiveTab('queue');
      if (user.role === 'Administrator' && activeTab === 'create') setActiveTab('users');
    }
  }, [user]);

  const handleTicketClick = (id: number) => {
    setSelectedTicketId(id);
    setActiveTab('detail');
  };

  const handleBackToList = () => {
    setSelectedTicketId(null);
    setActiveTab(user?.role === 'Requester' ? 'list' : 'queue');
  };

  const handleDrillDownToTickets = (filters?: { view?: string; status?: string; withinDays?: number }) => {
    setMyTicketsInitialFilter(filters || null);
    setActiveTab('list');
  };

  const handleDrillDownToQueue = (filters?: { ownerId?: string; status?: string; itPriority?: string; scope?: string; focusSearch?: boolean }) => {
    setStaffQueueInitialFilter(filters || null);
    setActiveTab('queue');
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.requiresPasswordChange) {
    return <ChangePassword />;
  }

  return (
    <>
      <nav className="navbar shadow-sm p-3 mb-4" style={{ backgroundColor: '#ffffff' }}>
        <div className="container-fluid d-flex flex-wrap justify-content-between align-items-center gap-3">
          {/* Logo */}
          <div className="navbar-brand fw-bolder mb-0 fs-3" style={{ color: '#212529', letterSpacing: '-0.02em' }}>
            TokTickIT <span style={{ color: '#006B3C' }}>IT Service Desk</span>
          </div>

          {/* Navigation Buttons */}
          <div className="d-flex flex-wrap align-items-center gap-2">
            <SystemStatus>
              <div className="vr d-none d-md-block mx-2" style={{ opacity: 0.2, backgroundColor: '#006B3C', width: '2px' }}></div>
              
              {user.role === 'Requester' && (
                <>
                  <button
                    className={`btn ${activeTab === 'dashboard' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: activeTab === 'dashboard' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'dashboard' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('dashboard')}
                  >
                    Dashboard
                  </button>
                  <button
                    className={`btn ${(activeTab === 'list' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: (activeTab === 'list' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'list' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                    onClick={() => { setMyTicketsInitialFilter(null); setActiveTab('list'); }}
                  >
                    My Tickets
                  </button>
                  <button
                    className={`btn ${activeTab === 'create' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: activeTab === 'create' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'create' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('create')}
                  >
                    Create Ticket
                  </button>
                </>
              )}

              {user.role === 'IT Staff' && (
                <>
                  <button
                    className={`btn ${activeTab === 'dashboard' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: activeTab === 'dashboard' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'dashboard' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('dashboard')}
                  >
                    Dashboard
                  </button>
                  <button
                    className={`btn ${(activeTab === 'queue' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: (activeTab === 'queue' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'queue' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                    onClick={() => { setStaffQueueInitialFilter(null); setActiveTab('queue'); }}
                  >
                    Ticket Queue
                  </button>
                </>
              )}

              {user.role === 'Administrator' && (
                <>
                  <button
                    className={`btn ${activeTab === 'dashboard' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: activeTab === 'dashboard' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'dashboard' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('dashboard')}
                  >
                    Dashboard
                  </button>
                  <button
                    className={`btn ${activeTab === 'users' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: activeTab === 'users' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'users' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('users')}
                  >
                    User Management
                  </button>
                  <button
                    className={`btn ${(activeTab === 'queue' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.5rem 1.25rem', backgroundColor: (activeTab === 'queue' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'queue' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                    onClick={() => { setStaffQueueInitialFilter(null); setActiveTab('queue'); }}
                  >
                    Ticket Queue
                  </button>
                </>
              )}
            </SystemStatus>
          </div>

          {/* User Controls */}
          <div className="d-flex align-items-center gap-3">
            <div className="text-end d-none d-sm-block">
              <div className="fw-bold" style={{ color: '#212529', lineHeight: '1.2' }}>{user.name}</div>
              <small className="text-muted fw-semibold" style={{ fontSize: '0.8rem' }}>{user.role}</small>
            </div>
            <button 
              className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: '40px', height: '40px' }}
              onClick={logout}
              title="Logout"
              aria-label="Logout"
            >
              <i className="bi bi-box-arrow-right"></i>
            </button>
          </div>
        </div>
      </nav>

      <div className="container position-relative mt-4 pt-2 pb-5" style={{ maxWidth: 1200 }}>
        {activeTab === 'dashboard' && user.role === 'Requester' && (
          <RequesterDashboard
            onNavigateToTickets={handleDrillDownToTickets}
            onNavigateToCreate={() => setActiveTab('create')}
            onTicketClick={handleTicketClick}
          />
        )}
        {activeTab === 'dashboard' && (user.role === 'IT Staff' || user.role === 'Administrator') && (
          <StaffDashboard
            onNavigateToQueue={handleDrillDownToQueue}
            onNavigateToUsers={() => setActiveTab('users')}
            onTicketClick={handleTicketClick}
          />
        )}
        {activeTab === 'create' && user.role === 'Requester' && <CreateTicket />}
        {activeTab === 'list' && user.role === 'Requester' && (
          <MyTickets
            onTicketClick={handleTicketClick}
            initialFilter={myTicketsInitialFilter}
            onClearInitialFilter={() => setMyTicketsInitialFilter(null)}
          />
        )}
        {activeTab === 'detail' && selectedTicketId && user.role === 'Requester' && (
          <TicketDetail ticketId={selectedTicketId} onBack={handleBackToList} />
        )}
        {activeTab === 'detail' && selectedTicketId && (user.role === 'IT Staff' || user.role === 'Administrator') && (
          <StaffTicketDetail ticketId={selectedTicketId} onBack={handleBackToList} />
        )}
        {activeTab === 'queue' && (user.role === 'IT Staff' || user.role === 'Administrator') && (
          <StaffQueue
            onTicketClick={handleTicketClick}
            initialFilter={staffQueueInitialFilter}
            onClearInitialFilter={() => setStaffQueueInitialFilter(null)}
          />
        )}
        {activeTab === 'users' && user.role === 'Administrator' && <UserManagement />}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
