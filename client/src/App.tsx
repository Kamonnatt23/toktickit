import { useState } from 'react';
import { SystemStatus } from "./components/SystemStatus.js";
import { DevProvider, useDevContext } from "./contexts/DevContext.js";
import { DevRequesterSelection } from "./components/DevRequesterSelection.js";
import { CreateTicket } from "./components/CreateTicket.js";
import { MyTickets } from "./components/MyTickets.js";

function AppContent() {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const { activeUser, setActiveUser } = useDevContext();

  return (
    <>
      {!activeUser && <DevRequesterSelection />}
      
      {activeUser && (
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
                <button 
                  className={`btn ${activeTab === 'create' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                  style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: activeTab === 'create' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'create' ? 'white' : '#006B3C' }}
                  onClick={() => setActiveTab('create')}
                >
                  Create Ticket
                </button>
                <button 
                  className={`btn ${activeTab === 'list' ? 'btn-success fw-bold' : 'btn-outline-success'}`}
                  style={{ borderRadius: '50rem', padding: '0.6rem 2rem', backgroundColor: activeTab === 'list' ? '#006B3C' : 'transparent', borderColor: '#006B3C', color: activeTab === 'list' ? 'white' : '#006B3C' }}
                  onClick={() => setActiveTab('list')}
                >
                  My Tickets
                </button>
              </SystemStatus>
            </div>

            {/* User Controls */}
            <DevRequesterSelection />
          </div>
        </nav>
      )}

      {activeUser && (
        <div className="container position-relative mt-5 pt-4 pb-5" style={{ maxWidth: 800 }}>
          {activeTab === 'create' ? <CreateTicket /> : <MyTickets />}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <DevProvider>
      <AppContent />
    </DevProvider>
  );
}

