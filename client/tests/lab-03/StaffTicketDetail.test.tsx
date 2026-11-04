import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaffTicketDetail } from '../../src/components/StaffTicketDetail';
import { AuthProvider } from '../../src/contexts/AuthContext';
import * as AuthContextModule from '../../src/contexts/AuthContext';
import { act } from 'react';

// Mock the AuthContext so we can inject different users
vi.mock('../../src/contexts/AuthContext', async () => {
  const actual = await vi.importActual('../../src/contexts/AuthContext');
  return {
    ...actual as any,
    useAuth: vi.fn(),
  };
});

const mockTicket = {
  id: 1,
  ticketNumber: 'TKT-0001',
  summary: 'Test Summary',
  description: 'Test Desc',
  status: 'New',
  priority: 'Medium',
  itPriority: 'Medium',
  ownerId: null,
  requester: { name: 'Bob', email: 'bob@example.com' },
  category: { name: 'Hardware' },
  relatedSystem: { name: 'Laptop' },
  attachments: [],
  updatedAt: '2026-11-04T12:00:00.000Z'
};

const mockStaff = [
  { id: 10, name: 'Active Staff' }
];

describe('StaffTicketDetail Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  const setupMockFetch = (ticketData: any = mockTicket) => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tickets/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(ticketData)
        });
      }
      if (url.includes('/api/staff/users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockStaff })
        });
      }
      return Promise.reject(new Error('not mocked'));
    });
  };

  it('renders read-only fields for IT Staff', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, name: 'Staff User', email: 'staff@example.com', role: 'IT Staff', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch();

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    expect(screen.getByText('TKT-0001')).toBeDefined();
    expect(screen.getByText('Test Summary')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('allows Claiming ticket and sends ownerId with latest ticket.updatedAt', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, name: 'Staff User', email: 'staff@example.com', role: 'IT Staff', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch();

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    const claimBtn = await screen.findByText('Claim Ticket');
    expect(claimBtn).toBeDefined();

    // Mock assign API call
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...mockTicket, ownerId: 10, owner: { name: 'Active Staff' } })
    }));

    await act(async () => {
      fireEvent.click(claimBtn);
    });

    // 1. handleAssign sends ownerId and current ticket.updatedAt
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/assign'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ownerId: 10, lastUpdatedAt: mockTicket.updatedAt })
    }));

    // 2. Successful assignment displays success and reloads Ticket data
    expect(screen.getByText('Ticket assigned successfully')).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tickets/1'), expect.objectContaining({
      credentials: 'include'
    }));

    // Verify related data is still rendered
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Hardware')).toBeDefined();
  });

  it('allows Reassigning and Unassigning via dropdown controls', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, name: 'Staff User', email: 'staff@example.com', role: 'IT Staff', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch({ ...mockTicket, ownerId: 10, owner: { id: 10, name: 'Active Staff' } });

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    const selects = screen.getAllByRole('combobox');
    const assigneeSelect = selects[1]; // 0: IT Priority, 1: Assignee, 2: Status

    // Mock assign API call for unassign
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...mockTicket, ownerId: null })
    }));

    await act(async () => {
      fireEvent.change(assigneeSelect, { target: { value: '' } });
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/assign'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ownerId: null, lastUpdatedAt: mockTicket.updatedAt })
    }));

    // Mock assign API call for reassign to staff id 10
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...mockTicket, ownerId: 10, owner: { name: 'Active Staff' } })
    }));

    await act(async () => {
      fireEvent.change(assigneeSelect, { target: { value: '10' } });
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/assign'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ownerId: 10, lastUpdatedAt: mockTicket.updatedAt })
    }));
  });

  it('handles 409 Conflict: displays Concurrency Notice, does not show success, does not overwrite owner, and Reload fetches fresh ticket', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, name: 'Staff User', email: 'staff@example.com', role: 'IT Staff', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch();

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    const claimBtn = await screen.findByText('Claim Ticket');

    // Mock 409 Conflict response
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: 'Ticket was modified by another session. Please reload the latest ticket data and try again.' })
    }));

    await act(async () => {
      fireEvent.click(claimBtn);
    });

    // 3. Displays existing Concurrency Notice
    expect(screen.getByText('Concurrency Notice:')).toBeDefined();
    expect(screen.getByText(/Ticket was modified by another session/)).toBeDefined();

    // 5. Does not display success message or overwrite current owner
    expect(screen.queryByText('Ticket assigned successfully')).toBeNull();
    expect(screen.getByText('-- Unassigned --')).toBeDefined();

    // 4. Reload Latest Data fetches fresh ticket from server and dismisses notice
    const reloadBtn = screen.getByText('Reload Latest Data');
    await act(async () => {
      fireEvent.click(reloadBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tickets/1'), expect.objectContaining({
      credentials: 'include'
    }));
    expect(screen.queryByText('Concurrency Notice:')).toBeNull();
  });

  it('prevents Administrator from seeing operational controls but allows viewing data', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 99, name: 'Admin User', email: 'admin@example.com', role: 'Administrator', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch();

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    // B. Verify Admin can view normal ticket information
    expect(screen.getByText('TKT-0001')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined(); // Requester
    expect(screen.getByText('Hardware')).toBeDefined(); // Category
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0); // Priority
    expect(screen.getByText('Unassigned')).toBeDefined(); // Owner

    // C. Verify Admin does NOT see mutation controls
    expect(screen.queryByText('Claim Ticket')).toBeNull();
    expect(screen.queryByText('Update Status')).toBeNull();

    // Check for absences of dropdowns that would allow IT Priority/Assign
    // The component renders standard divs for these when not staff
    const selects = screen.queryAllByRole('combobox');
    expect(selects.length).toBe(0);
  });

  it('shows required comment area for transitions', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, name: 'Staff User', email: 'staff@example.com', role: 'IT Staff', requiresPasswordChange: false }, isLoading: false, setUser: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() });
    setupMockFetch({ ...mockTicket, status: 'In Progress', ownerId: 10 });

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });


    // there are multiple selects, let's find the status one
    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[2]; // 0: IT Priority, 1: Assignee, 2: Status

    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'Waiting for Requester' } });
    });

    // Should show text area
    expect(screen.getByPlaceholderText('Public comment (required)')).toBeDefined();
  });
});
