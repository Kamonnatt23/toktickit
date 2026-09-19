import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { ChangePassword } from '../../src/components/ChangePassword';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ChangePassword Component', () => {
  let meResponse: any = { ok: true, status: 200, json: async () => ({ id: 1, role: 'Requester', requiresPasswordChange: true }) };
  let changePasswordResponse: any = { ok: true, json: async () => ({ message: 'Success' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    meResponse = { ok: true, status: 200, json: async () => ({ id: 1, role: 'Requester', requiresPasswordChange: true }) };
    changePasswordResponse = { ok: true, json: async () => ({ message: 'Success' }) };

    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('/api/auth/me')) return meResponse;
      if (url.includes('/api/auth/change-password')) return changePasswordResponse;
      if (url.includes('/api/health')) return { ok: true, json: async () => ({}) };
      if (url.includes('/api/categories')) return { ok: true, json: async () => ([]) };
      if (url.includes('/api/related-systems')) return { ok: true, json: async () => ([]) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it('validates matching and length of new passwords', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    const oldInput = document.querySelectorAll('input[type="password"]')[0];
    const newInput = document.querySelectorAll('input[type="password"]')[1];
    const confirmInput = document.querySelectorAll('input[type="password"]')[2];
    const submitBtn = screen.getByRole('button', { name: /save password/i });

    // Test non-matching
    fireEvent.change(oldInput, { target: { value: 'password123' } });
    fireEvent.change(newInput, { target: { value: 'newpassword' } });
    fireEvent.change(confirmInput, { target: { value: 'different' } });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();

    // Test length
    fireEvent.change(newInput, { target: { value: 'short' } });
    fireEvent.change(confirmInput, { target: { value: 'short' } });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText('Password must be at least 8 characters long')).toBeInTheDocument();
  });

  it('handles failed password change', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Change Password')).toBeInTheDocument());

    // API fail
    changePasswordResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid old password' })
    };

    fireEvent.change(document.querySelectorAll('input[type="password"]')[0], { target: { value: 'wrong' } });
    fireEvent.change(document.querySelectorAll('input[type="password"]')[1], { target: { value: 'newpassword' } });
    fireEvent.change(document.querySelectorAll('input[type="password"]')[2], { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /save password/i }));

    expect(await screen.findByText('Invalid old password')).toBeInTheDocument();
  });

  it('handles successful password change and redirects to app', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Change Password')).toBeInTheDocument());

    // After change password succeeds, the component will call refreshUser()
    // We should make meResponse return requiresPasswordChange: false now
    changePasswordResponse = { ok: true, json: async () => ({ message: 'Success' }) };
    meResponse = { ok: true, status: 200, json: async () => ({ id: 1, role: 'Requester', name: 'Test User', requiresPasswordChange: false }) };

    fireEvent.change(document.querySelectorAll('input[type="password"]')[0], { target: { value: 'password123' } });
    fireEvent.change(document.querySelectorAll('input[type="password"]')[1], { target: { value: 'newpassword' } });
    fireEvent.change(document.querySelectorAll('input[type="password"]')[2], { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /save password/i }));

    // Should redirect to App
    await waitFor(() => {
      expect(screen.getByText('TokTickIT')).toBeInTheDocument();
      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
      expect(screen.queryByText('Change Password')).not.toBeInTheDocument();
    });
  });
});
