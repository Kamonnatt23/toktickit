import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { StaffDashboard } from '../../src/components/StaffDashboard';
import { RequesterDashboard } from '../../src/components/RequesterDashboard';
import { StaffQueue } from '../../src/components/StaffQueue';
import * as AuthContextModule from '../../src/contexts/AuthContext';

const mockStaffUser = {
  id: 2,
  name: 'Alice Staff',
  email: 'alice@example.com',
  role: 'IT Staff',
  requiresPasswordChange: false
};

const mockRequesterUser = {
  id: 1,
  name: 'Charlie Requester',
  email: 'charlie@example.com',
  role: 'Requester',
  requiresPasswordChange: false
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('UI Style Tests (UI-STY-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UI-STY-01: Verifies status badge classes match the approved contract', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockStaffUser,
      isLoading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    });

    const statusMap = [
      { status: 'New', expectedClass: 'bg-primary' },
      { status: 'Open', expectedClass: 'bg-primary' },
      { status: 'In Progress', expectedClass: 'bg-info' },
      { status: 'Waiting for Requester', expectedClass: 'bg-warning' },
      { status: 'Resolved', expectedClass: 'bg-success' },
      { status: 'Closed', expectedClass: 'bg-secondary' },
      { status: 'Reopened', expectedClass: 'bg-danger' },
    ];

    const mockDashboardData = {
      metrics: {
        unassigned: 1,
        myAssigned: 1,
        new: 1,
        open: 1,
        inProgress: 1,
        waitingForRequester: 1
      },
      priorityBreakdown: {
        critical: 1,
        high: 1,
        medium: 1,
        low: 1
      },
      recentTickets: statusMap.map((s, idx) => ({
        id: idx + 1,
        ticketNumber: `TKT-00${idx + 1}`,
        summary: `Test ticket for status ${s.status}`,
        status: s.status,
        priority: 'Medium',
        itPriority: 'Medium',
        owner: { id: 2, name: 'Alice Staff' },
        requester: { id: 1, name: 'Charlie Requester' },
        updatedAt: '2026-11-05T10:00:00.000Z'
      }))
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockDashboardData
    });

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText('TKT-001')).toBeDefined();
    });

    const recentTable = screen.getByRole('table');
    // Check each status badge in recent queue table
    for (const item of statusMap) {
      const badge = within(recentTable).getByText(item.status);
      expect(badge.className).toContain('badge');
      expect(badge.className).toContain(item.expectedClass);
      if (item.status === 'In Progress' || item.status === 'Waiting for Requester') {
        expect(badge.className).toContain('text-dark');
      }
    }
  });

  it('UI-STY-01: Verifies active IT Priority badges and breakdown styling', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockStaffUser,
      isLoading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    });

    const mockDashboardData = {
      metrics: {
        unassigned: 2,
        myAssigned: 3,
        new: 1,
        open: 2,
        inProgress: 1,
        waitingForRequester: 1
      },
      priorityBreakdown: {
        critical: 2,
        high: 4,
        medium: 5,
        low: 1
      },
      recentTickets: [
        {
          id: 1,
          ticketNumber: 'TKT-001',
          summary: 'Critical priority incident',
          status: 'Open',
          priority: 'Critical',
          itPriority: 'Critical',
          owner: null,
          requester: { id: 1, name: 'Charlie' },
          updatedAt: '2026-11-05T10:00:00.000Z'
        },
        {
          id: 2,
          ticketNumber: 'TKT-002',
          summary: 'High priority incident',
          status: 'In Progress',
          priority: 'High',
          itPriority: 'High',
          owner: { id: 2, name: 'Alice' },
          requester: { id: 1, name: 'Charlie' },
          updatedAt: '2026-11-05T10:00:00.000Z'
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockDashboardData
    });

    render(<StaffDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Active Priority Distribution:/i)).toBeDefined();
    });

    // Priority breakdown pills/buttons
    const critBtn = screen.getByRole('button', { name: /Critical/i });
    expect(critBtn.className).toContain('btn-danger');

    const highBtn = screen.getByRole('button', { name: /High/i });
    expect(highBtn.className).toContain('btn-warning');
    expect(highBtn.className).toContain('text-dark');

    const medBtn = screen.getByRole('button', { name: /Medium/i });
    expect(medBtn.className).toContain('btn-primary');

    const lowBtn = screen.getByRole('button', { name: /Low/i });
    expect(lowBtn.className).toContain('btn-secondary');
  });

  it('UI-STY-01: Verifies Zen Green primary brand tokens and background tones', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockRequesterUser,
      isLoading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        metrics: {
          openTickets: 2,
          waitingForRequester: 1,
          inProgress: 1,
          resolved: 3,
          closed: 4
        },
        recentlyUpdatedTickets: [],
        recentlyResolvedTickets: []
      })
    });

    const { container } = render(<RequesterDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome, Charlie Requester!/)).toBeDefined();
    });

    // Header has Zen Green theme (#006B3C / rgb(0, 107, 60))
    const quickCreateBtn = screen.getByText('+ Create Ticket');
    expect(quickCreateBtn).toBeDefined();
    const btnStyle = quickCreateBtn.getAttribute('style') || '';
    expect(btnStyle).toMatch(/background-color:\s*(#006B3C|rgb\(0,\s*107,\s*60\))/i);
    expect(btnStyle).toContain('border-radius: 50rem');

    // Cards use cream/off-white background `#fdfaf6` and 15px-20px radius
    const dashboardCards = container.querySelectorAll('.card');
    expect(dashboardCards.length).toBeGreaterThan(0);
    const firstCard = dashboardCards[0] as HTMLElement;
    expect(firstCard.getAttribute('style')).toContain('border-radius');
  });

  it('UI-STY-01: Verifies responsive table wrapper and absence of blanket overflow-x: hidden', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockStaffUser,
      isLoading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    });

    // Mock category, staff users, and tickets responses
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/api/categories')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 1, name: 'Hardware' }]
        };
      }
      if (url.includes('/api/staff/users')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 2, name: 'Alice Staff' }] })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              ticketNumber: 'TKT-001',
              summary: 'Queue test item',
              status: 'Open',
              priority: 'High',
              itPriority: 'High',
              category: { name: 'Hardware' },
              requester: { name: 'Charlie' },
              owner: null,
              createdAt: '2026-11-05T08:00:00.000Z'
            }
          ],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
        })
      };
    });

    const { container } = render(<StaffQueue />);

    await waitFor(() => {
      expect(screen.getAllByText('TKT-001').length).toBeGreaterThan(0);
    });

    // Check table-responsive wrapper exists
    const tableResponsive = container.querySelector('.table-responsive');
    expect(tableResponsive).not.toBeNull();

    // Verify document / body does not have blanket overflow-x: hidden
    expect(document.body.style.overflowX).not.toBe('hidden');
    expect(container.style.overflowX).not.toBe('hidden');
  });
});
