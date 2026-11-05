import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RequesterDashboard } from '../../src/components/RequesterDashboard';
import * as AuthContextModule from '../../src/contexts/AuthContext';

const mockRequesterUser = {
  id: 1,
  name: 'Charlie Requester',
  email: 'charlie@example.com',
  role: 'Requester',
  requiresPasswordChange: false
};

const mockStaffUser = {
  id: 2,
  name: 'Alice Staff',
  email: 'alice@example.com',
  role: 'IT Staff',
  requiresPasswordChange: false
};

const mockPopulatedResponse = {
  metrics: {
    openTickets: 3,
    waitingForRequester: 1,
    inProgress: 2,
    resolved: 5,
    closed: 8
  },
  recentlyUpdatedTickets: [
    {
      id: 101,
      ticketNumber: 'TKT-0101',
      summary: 'Network connectivity failing in Building B',
      status: 'In Progress',
      priority: 'High',
      updatedAt: '2026-11-05T10:00:00.000Z',
      createdAt: '2026-11-01T08:00:00.000Z'
    },
    {
      id: 102,
      ticketNumber: 'TKT-0102',
      summary: 'Need printer toner replacement',
      status: 'Waiting for Requester',
      priority: 'Medium',
      updatedAt: '2026-11-05T09:00:00.000Z',
      createdAt: '2026-11-02T08:00:00.000Z'
    }
  ],
  recentlyResolvedTickets: [
    {
      id: 103,
      ticketNumber: 'TKT-0103',
      summary: 'VPN client credentials expired',
      status: 'Resolved',
      priority: 'High',
      updatedAt: '2026-11-04T12:00:00.000Z',
      createdAt: '2026-11-03T08:00:00.000Z',
      resolvedAt: '2026-11-04T12:00:00.000Z'
    }
  ]
};

const mockEmptyResponse = {
  metrics: {
    openTickets: 0,
    waitingForRequester: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0
  },
  recentlyUpdatedTickets: [],
  recentlyResolvedTickets: []
};

describe('RequesterDashboard Component (Issue #59 / Lab 4)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockRequesterUser,
      isLoading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // UI-DASH-01: RequesterDashboard renders 5 metric cards and 4 UI states
  // --------------------------------------------------------------------------
  describe('UI-DASH-01: Renders 5 metric cards and handles 4 UI states', () => {
    it('displays loading placeholders while fetching data', async () => {
      let resolveFetch: any;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { container } = render(<RequesterDashboard />);

      // Verify skeleton placeholders are rendered
      const placeholders = container.querySelectorAll('.placeholder-glow');
      expect(placeholders.length).toBeGreaterThan(0);

      // Clean up pending promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => mockPopulatedResponse
        });
      });
    });

    it('renders all 5 metric cards and recent activity lists in populated state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPopulatedResponse
      });

      await act(async () => {
        render(<RequesterDashboard />);
      });

      // Greeting
      expect(screen.getByText('Welcome, Charlie Requester!')).toBeDefined();

      // Metric Cards
      expect(screen.getByText('My Open Tickets')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();

      expect(screen.getByText('Action Required')).toBeDefined();
      expect(screen.getByText('1')).toBeDefined();

      expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
      expect(screen.getByText('2')).toBeDefined();

      expect(screen.getByText('Recently Resolved')).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();

      expect(screen.getByText('Closed')).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();

      // Activity Lists
      expect(screen.getByText('Recently Updated Tickets')).toBeDefined();
      expect(screen.getByText('Network connectivity failing in Building B')).toBeDefined();
      expect(screen.getByText('TKT-0101')).toBeDefined();

      expect(screen.getByText('Recently Resolved Tickets')).toBeDefined();
      expect(screen.getByText('VPN client credentials expired')).toBeDefined();
      expect(screen.getByText('TKT-0103')).toBeDefined();

      // Quick Actions
      expect(screen.getByText('+ Create Ticket')).toBeDefined();
      expect(screen.getByText('View My Tickets')).toBeDefined();
    });

    it('renders Empty state when requester has 0 tickets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmptyResponse
      });

      const onNavigateToCreate = vi.fn();

      await act(async () => {
        render(<RequesterDashboard onNavigateToCreate={onNavigateToCreate} />);
      });

      expect(
        screen.getByText('No tickets submitted yet. Need help? Create your first ticket!')
      ).toBeDefined();

      const createBtn = screen.getByText('+ Create Ticket');
      expect(createBtn).toBeDefined();

      fireEvent.click(createBtn);
      expect(onNavigateToCreate).toHaveBeenCalledTimes(1);
    });

    it('renders Forbidden state when server returns HTTP 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' })
      });

      await act(async () => {
        render(<RequesterDashboard />);
      });

      expect(screen.getByText('Access Denied')).toBeDefined();
      expect(
        screen.getByText('Requester dashboard is available only to Requesters.')
      ).toBeDefined();
    });

    it('renders Forbidden state when user role is not Requester', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      await act(async () => {
        render(<RequesterDashboard />);
      });

      expect(screen.getByText('Access Denied')).toBeDefined();
      expect(
        screen.getByText('Requester dashboard is available only to Requesters.')
      ).toBeDefined();
    });

    it('renders Safe Failure state on 500 error and retries upon clicking Retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server failure' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPopulatedResponse
        });

      await act(async () => {
        render(<RequesterDashboard />);
      });

      expect(screen.getByText('Unable to load dashboard data.')).toBeDefined();
      const retryBtn = screen.getByText(/Retry/i);
      expect(retryBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Welcome, Charlie Requester!')).toBeDefined();
      expect(screen.getByText('My Open Tickets')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // UI-DASH-02: Clicking "My Open Tickets" metric card
  // --------------------------------------------------------------------------
  describe('UI-DASH-02: Clicking "My Open Tickets" navigates to /tickets?view=open', () => {
    it('triggers onNavigateToTickets({ view: "open" }) when clicking card link', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPopulatedResponse
      });

      const onNavigateToTickets = vi.fn();

      await act(async () => {
        render(<RequesterDashboard onNavigateToTickets={onNavigateToTickets} />);
      });

      const openCard = screen.getByText('My Open Tickets').closest('.card')!;
      const viewAllBtn = openCard.querySelector('button')!;
      fireEvent.click(viewAllBtn);

      expect(onNavigateToTickets).toHaveBeenCalledWith({ view: 'open' });
    });
  });

  // --------------------------------------------------------------------------
  // UI-DASH-03: Clicking "Recently Resolved" metric card & other drill-downs
  // --------------------------------------------------------------------------
  describe('UI-DASH-03: Clicking "Recently Resolved" navigates to /tickets?status=Resolved&withinDays=30', () => {
    it('triggers onNavigateToTickets({ status: "Resolved", withinDays: 30 })', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPopulatedResponse
      });

      const onNavigateToTickets = vi.fn();

      await act(async () => {
        render(<RequesterDashboard onNavigateToTickets={onNavigateToTickets} />);
      });

      const resolvedCard = screen.getByText('Recently Resolved').closest('.card')!;
      const viewAllBtn = resolvedCard.querySelector('button')!;
      fireEvent.click(viewAllBtn);

      expect(onNavigateToTickets).toHaveBeenCalledWith({ status: 'Resolved', withinDays: 30 });
    });

    it('triggers onNavigateToTickets with respective filters for other cards and Quick Actions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPopulatedResponse
      });

      const onNavigateToTickets = vi.fn();
      const onNavigateToCreate = vi.fn();
      const onTicketClick = vi.fn();

      await act(async () => {
        render(
          <RequesterDashboard
            onNavigateToTickets={onNavigateToTickets}
            onNavigateToCreate={onNavigateToCreate}
            onTicketClick={onTicketClick}
          />
        );
      });

      // Action Required card -> status: Waiting for Requester
      const actionCard = screen.getByText('Action Required').closest('.card')!;
      fireEvent.click(actionCard.querySelector('button')!);
      expect(onNavigateToTickets).toHaveBeenCalledWith({ status: 'Waiting for Requester' });

      // In Progress card -> status: In Progress
      const inProgressCard = screen.getAllByText('In Progress')[0].closest('.card')!;
      fireEvent.click(inProgressCard.querySelector('button')!);
      expect(onNavigateToTickets).toHaveBeenCalledWith({ status: 'In Progress' });

      // Closed card -> status: Closed
      const closedCard = screen.getByText('Closed').closest('.card')!;
      fireEvent.click(closedCard.querySelector('button')!);
      expect(onNavigateToTickets).toHaveBeenCalledWith({ status: 'Closed' });

      // Quick action "View My Tickets"
      const viewMyTicketsBtn = screen.getByText('View My Tickets');
      fireEvent.click(viewMyTicketsBtn);
      expect(onNavigateToTickets).toHaveBeenCalledWith();

      // Quick action "+ Create Ticket"
      const createBtn = screen.getByText('+ Create Ticket');
      fireEvent.click(createBtn);
      expect(onNavigateToCreate).toHaveBeenCalledTimes(1);

      // Ticket list item click
      const ticketItem = screen.getByText('Network connectivity failing in Building B');
      fireEvent.click(ticketItem);
      expect(onTicketClick).toHaveBeenCalledWith(101);
    });
  });
});
