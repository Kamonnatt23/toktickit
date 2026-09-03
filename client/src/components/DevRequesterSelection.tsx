import { useDevContext } from '../contexts/DevContext.js';
import { useState } from 'react';

export function DevRequesterSelection() {
  const { activeUser, users, loading, error, setActiveUser } = useDevContext();
  const [selectedId, setSelectedId] = useState<string>('');

  if (activeUser) {
    return (
      <div className="bg-warning text-dark px-3 py-2 d-flex justify-content-between align-items-center" style={{ fontSize: '0.9rem', borderBottom: '1px solid #d39e00' }}>
        <div>
          <strong>[TESTING MODE]</strong> Logged in as: {activeUser.name} ({activeUser.email})
        </div>
        <button 
          className="btn btn-sm btn-outline-dark" 
          onClick={() => setActiveUser(null)}
        >
          Change Requester
        </button>
      </div>
    );
  }

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-center" style={{ zIndex: 1050 }}>
      <div className="card shadow-lg" style={{ maxWidth: 500, width: '100%' }}>
        <div className="card-header bg-dark text-white border-bottom-0 pt-4 pb-3 px-4">
          <h2 className="h4 mb-0">Select Development Context</h2>
          <small className="text-light opacity-75">Simulate user login for testing purposes</small>
        </div>
        <div className="card-body p-4 bg-light">
          {loading && <p>Loading mock users...</p>}
          {error && <div className="alert alert-danger">{error}</div>}
          {!loading && !error && (
            <div className="mb-4">
              <label htmlFor="userSelect" className="form-label text-dark fw-bold">Select Requester</label>
              <select 
                id="userSelect"
                className="form-select form-select-lg mb-3" 
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
              >
                <option value="">-- Choose a mock user --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}
          <button 
            className="btn btn-success btn-lg w-100" 
            style={{ backgroundColor: '#006B3C', borderColor: '#006B3C' }}
            disabled={!selectedId}
            onClick={() => {
              const user = users.find(u => u.id === parseInt(selectedId));
              if (user) setActiveUser(user);
            }}
          >
            Continue as User
          </button>
        </div>
      </div>
    </div>
  );
}
