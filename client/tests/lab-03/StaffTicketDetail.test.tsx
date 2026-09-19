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
  attachments: []
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
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, role: 'IT Staff' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
    setupMockFetch();

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });

    expect(screen.getByText('TKT-0001')).toBeDefined();
    expect(screen.getByText('Test Summary')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('allows Claiming ticket', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, role: 'IT Staff' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
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

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/assign'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ownerId: 10 })
    }));

    // Verify refetch was called
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tickets/1'), expect.objectContaining({
      credentials: 'include'
    }));

    // Verify related data is still rendered
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Hardware')).toBeDefined();
  });

  it('prevents Administrator from seeing operational controls but allows viewing data', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 99, role: 'Administrator' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
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
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 10, role: 'IT Staff' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
    setupMockFetch({ ...mockTicket, status: 'In Progress', ownerId: 10 });

    await act(async () => {
      render(<StaffTicketDetail ticketId={1} onBack={vi.fn()} />);
    });


    // there are multiple selects, let's find the status one
    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[2]; // 0: IT Priority, 1: Assignee, 2: Status

    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'Resolved' } });
    });

    // Should show text area
    expect(screen.getByPlaceholderText('Public comment (required)')).toBeDefined();
  });
});
