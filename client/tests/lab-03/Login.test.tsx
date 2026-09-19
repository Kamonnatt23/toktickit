import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from '../../src/components/Login';
import { AuthProvider } from '../../src/contexts/AuthContext';
import App from '../../src/App';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Login Component', () => {
  let meResponse: any = { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
  let loginResponse: any = { ok: true, status: 200, json: async () => ({}) };

  beforeEach(() => {
    vi.clearAllMocks();
    meResponse = { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    
    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('/api/auth/me')) return meResponse;
      if (url.includes('/api/auth/login')) return loginResponse;
      if (url.includes('/api/health')) return { ok: true, json: async () => ({}) };
      if (url.includes('/api/categories')) return { ok: true, json: async () => ([]) };
      if (url.includes('/api/related-systems')) return { ok: true, json: async () => ([]) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it('renders login form correctly', async () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );
    
    expect(screen.getByText('Sign in to IT Service Desk')).toBeInTheDocument();
    expect(document.querySelector('input[type="email"]')).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );
    
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(await screen.findByText('Email and password are required')).toBeInTheDocument();
  });

  it('displays safe generic error on invalid login', async () => {
    loginResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials or account inactive' })
    };

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials or account inactive')).toBeInTheDocument();
  });

  it('handles successful login and triggers AuthContext update', async () => {
    loginResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'Requester',
        requiresPasswordChange: false
      })
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign in to IT Service Desk')).toBeInTheDocument();
    });

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('TokTickIT')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    });
  });

  it('routes to Change Password screen if requiresPasswordChange is true', async () => {
    loginResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'Requester',
        requiresPasswordChange: true
      })
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign in to IT Service Desk')).toBeInTheDocument();
    });

    meResponse = loginResponse;

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
      expect(screen.getByText('You must change your initial password before continuing.')).toBeInTheDocument();
      expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
    });
  });
});
