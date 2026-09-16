import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function Login() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid credentials or account inactive');
      }
    } catch (err) {
      setError('Unable to connect to the server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '80vh' }}>
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', border: 'none' }}>
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <h2 className="fw-bolder" style={{ color: '#212529', letterSpacing: '-0.02em' }}>TokTickIT</h2>
            <p className="text-muted">Sign in to IT Service Desk</p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="email" className="form-label text-secondary fw-semibold">Email</label>
              <input
                id="email"
                type="email"
                className="form-control bg-light border-0"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="password" className="form-label text-secondary fw-semibold">Password</label>
              <input
                id="password"
                type="password"
                className="form-control bg-light border-0"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-success w-100 fw-bold"
              style={{ padding: '0.75rem', backgroundColor: '#006B3C', borderColor: '#006B3C', borderRadius: '8px' }}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
