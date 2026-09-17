import { useState, useEffect } from 'react';
import { SystemStatus } from "./components/SystemStatus";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Login";
import { ChangePassword } from "./components/ChangePassword";
import { CreateTicket } from "./components/CreateTicket";
import { MyTickets } from "./components/MyTickets";
import { TicketDetail } from "./components/TicketDetail";
import { StaffQueue } from "./components/StaffQueue";

function AppContent() {
  const { user, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'detail' | 'queue' | 'users'>('create');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

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
          <div className="d-flex align-items-center gap-2">
            <SystemStatus>
              <div className="vr d-none d-md-block mx-2" style={{ opacity: 0.2, backgroundColor: '#006B3C', width: '2px' }}></div>
              
              {user.role === 'Requester' && (
                <>
                  <button 
                    className={`btn ${activeTab === 'create' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: activeTab === 'create' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'create' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('create')}
                  >
                    Create Ticket
                  </button>
                  <button 
                    className={`btn ${(activeTab === 'list' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: (activeTab === 'list' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'list' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('list')}
                  >
                    My Tickets
                  </button>
                </>
              )}

              {user.role === 'IT Staff' && (
                <button 
                  className={`btn ${(activeTab === 'queue' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                  style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: (activeTab === 'queue' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'queue' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                  onClick={() => setActiveTab('queue')}
                >
                  Ticket Queue
                </button>
              )}

              {user.role === 'Administrator' && (
                <>
                  <button 
                    className={`btn ${activeTab === 'users' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: activeTab === 'users' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'users' ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('users')}
                  >
                    User Management
                  </button>
                  <button 
                    className={`btn ${(activeTab === 'queue' || activeTab === 'detail') ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                    style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: (activeTab === 'queue' || activeTab === 'detail') ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: (activeTab === 'queue' || activeTab === 'detail') ? 'white' : '#006B3C' }}
                    onClick={() => setActiveTab('queue')}
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

      <div className="container position-relative mt-5 pt-4 pb-5" style={{ maxWidth: 1000 }}>
        {activeTab === 'create' && user.role === 'Requester' && <CreateTicket />}
        {activeTab === 'list' && user.role === 'Requester' && <MyTickets onTicketClick={handleTicketClick} />}
        {activeTab === 'detail' && selectedTicketId && <TicketDetail ticketId={selectedTicketId} onBack={handleBackToList} />}
        {activeTab === 'queue' && (user.role === 'IT Staff' || user.role === 'Administrator') && <StaffQueue onTicketClick={handleTicketClick} />}
        {activeTab === 'users' && user.role === 'Administrator' && <div className="text-center mt-5 text-muted"><h4>User Management (Not Implemented)</h4></div>}
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
