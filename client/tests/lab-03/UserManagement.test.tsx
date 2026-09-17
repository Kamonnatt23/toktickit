import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserManagement from '../../src/components/UserManagement';
import * as AuthContextModule from '../../src/contexts/AuthContext';
import { api } from '../../src/api';

vi.mock('../../src/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  }
}));

const mockUser = {
  id: 3,
  name: 'Admin Bob',
  email: 'admin@example.com',
  role: 'Administrator',
  requiresPasswordChange: false
};

const renderWithContext = (role = 'Administrator') => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { ...mockUser, role } as any,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false
  });
  return render(<UserManagement />);
};

describe('UserManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies access to non-Administrators', () => {
    renderWithContext('IT Staff');
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  it('renders user list for Administrators', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, name: 'User 1', email: 'user1@test.com', role: 'Requester', isActive: true }
        ]
      })
    } as any);

    renderWithContext('Administrator');
    
    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
    });
    expect(screen.getByText('user1@test.com')).toBeInTheDocument();
    expect(screen.getAllByText('Requester').length).toBeGreaterThan(0);
  });

  it('handles duplicate email 409 conflict gracefully during creation', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    } as any);

    renderWithContext('Administrator');
    
    // Open modal
    fireEvent.click(screen.getByText('+ Create User'));
    
    expect(screen.getByText('Create User')).toBeInTheDocument();
    
    // Fill form
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Dup User' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'dup@test.com' } });
    fireEvent.change(screen.getByLabelText(/Initial Password/i), { target: { value: '123' } });
    
    // Submit
    vi.mocked(api.post).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Email already exists' })
    } as any);

    fireEvent.submit(document.querySelector('#userForm') as Element);

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });
});
