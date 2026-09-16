import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function ChangePassword() {
  const { user, refreshUser, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
        credentials: 'include'
      });

      if (res.ok) {
        await refreshUser();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Unable to connect to the server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '80vh' }}>
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: '450px', borderRadius: '12px', border: 'none' }}>
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <h3 className="fw-bolder" style={{ color: '#212529', letterSpacing: '-0.02em' }}>Change Password</h3>
            <p className="text-muted">You must change your initial password before continuing.</p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="oldPassword" className="form-label text-secondary fw-semibold">Current Password</label>
              <input
                id="oldPassword"
                type="password"
                className="form-control bg-light border-0"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="newPassword" className="form-label text-secondary fw-semibold">New Password</label>
              <input
                id="newPassword"
                type="password"
                className="form-control bg-light border-0"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="confirmPassword" className="form-label text-secondary fw-semibold">Confirm New Password</label>
              <input
                id="confirmPassword"
                type="password"
                className="form-control bg-light border-0"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary w-50 fw-bold"
                style={{ padding: '0.75rem', borderRadius: '8px' }}
                onClick={logout}
                disabled={isLoading}
              >
                Logout
              </button>
              <button
                type="submit"
                className="btn btn-success w-50 fw-bold"
                style={{ padding: '0.75rem', backgroundColor: '#006B3C', borderColor: '#006B3C', borderRadius: '8px' }}
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
