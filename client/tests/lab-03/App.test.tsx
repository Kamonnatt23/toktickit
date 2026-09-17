import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('App Shell & Role Navigation', () => {
  let meResponse: any = { ok: true, status: 200, json: async () => ({ id: 1, role: 'Requester', name: 'Requester John', requiresPasswordChange: false }) };
  let logoutResponse: any = { ok: true, json: async () => ({ message: 'Logged out' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    meResponse = { ok: true, status: 200, json: async () => ({ id: 1, role: 'Requester', name: 'Requester John', requiresPasswordChange: false }) };
    logoutResponse = { ok: true, json: async () => ({ message: 'Logged out' }) };

    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('/api/auth/me')) return meResponse;
      if (url.includes('/api/auth/logout')) {
        meResponse = { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }; // after logout, me should fail
        return logoutResponse;
      }
      if (url.includes('/api/health')) return { ok: true, json: async () => ({}) };
      if (url.includes('/api/categories')) return { ok: true, json: async () => ([]) };
      if (url.includes('/api/related-systems')) return { ok: true, json: async () => ([]) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it('renders Requester navigation correctly', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Requester John')).toBeInTheDocument());
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    expect(screen.getByText('My Tickets')).toBeInTheDocument();
    expect(screen.queryByText('Ticket Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
  });

  it('renders IT Staff navigation correctly', async () => {
    meResponse = {
      ok: true,
      json: async () => ({
        id: 2,
        role: 'IT Staff',
        name: 'Staff Jane',
        requiresPasswordChange: false
      })
    };

    render(<App />);

    await waitFor(() => expect(screen.getByText('Staff Jane')).toBeInTheDocument());
    expect(screen.getByText('Ticket Queue')).toBeInTheDocument();
    expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
  });

  it('renders Administrator navigation correctly', async () => {
    meResponse = {
      ok: true,
      json: async () => ({
        id: 3,
        role: 'Administrator',
        name: 'Admin Bob',
        requiresPasswordChange: false
      })
    };

    render(<App />);

    await waitFor(() => expect(screen.getByText('Admin Bob')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'User Management' })).toBeInTheDocument();
    expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Ticket Queue')).toBeInTheDocument();
  });

  it('handles logout and redirects to login', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Requester John')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Logout'));

    await waitFor(() => {
      expect(screen.getByText('Sign in to IT Service Desk')).toBeInTheDocument();
    });
  });
});
