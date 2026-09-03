import { useState } from 'react';
import { SystemStatus } from "./components/SystemStatus.js";
import { DevProvider } from "./contexts/DevContext.js";
import { DevRequesterSelection } from "./components/DevRequesterSelection.js";
import { CreateTicket } from "./components/CreateTicket.js";
import { MyTickets } from "./components/MyTickets.js";

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');

  return (
    <DevProvider>
      <DevRequesterSelection />
      <div className="container py-5" style={{ maxWidth: 800 }}>
        <h1 className="display-4 fw-bolder text-center mb-5 mt-3" style={{ color: '#212529', letterSpacing: '-0.02em' }}>
          TokTickIT <span style={{ color: '#006B3C' }}>IT Service Desk</span>
        </h1>
        <SystemStatus>
          <div className="d-flex gap-3">
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
          </div>
        </SystemStatus>

        {activeTab === 'create' ? <CreateTicket /> : <MyTickets />}
      </div>
    </DevProvider>
  );
}

