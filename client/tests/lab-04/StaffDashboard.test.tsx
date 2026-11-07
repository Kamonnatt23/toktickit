import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { StaffDashboard } from '../../src/components/StaffDashboard';
import * as AuthContextModule from '../../src/contexts/AuthContext';

const mockStaffUser = {
  id: 2,
  name: 'Alice Staff',
  email: 'alice@example.com',
  role: 'IT Staff',
  requiresPasswordChange: false
};

const mockAdminUser = {
  id: 3,
  name: 'Bob Admin',
  email: 'bob@example.com',
  role: 'Administrator',
  requiresPasswordChange: false
};

const mockRequesterUser = {
  id: 1,
  name: 'Charlie Requester',
  email: 'charlie@example.com',
  role: 'Requester',
  requiresPasswordChange: false
};

const mockStaffResponse = {
  metrics: {
    unassigned: 4,
    myAssigned: 3,
    new: 2,
    open: 3,
    inProgress: 2,
    waitingForRequester: 1
  },
  priorityBreakdown: {
    critical: 2,
    high: 3,
    medium: 4,
    low: 1
  },
  recentTickets: [
    {
      id: 201,
      ticketNumber: 'TKT-0201',
      summary: 'Database connection pool exhausted',
      status: 'In Progress',
      priority: 'Critical',
      itPriority: 'Critical',
      owner: { id: 2, name: 'Alice Staff' },
      requester: { id: 1, name: 'Charlie Requester' },
      updatedAt: '2026-11-05T11:00:00.000Z'
    },
    {
      id: 202,
      ticketNumber: 'TKT-0202',
      summary: 'New employee workstation setup',
      status: 'Open',
      priority: 'Medium',
      itPriority: 'Medium',
      owner: null,
      requester: { id: 1, name: 'Charlie Requester' },
      updatedAt: '2026-11-05T10:30:00.000Z'
    }
  ]
};

const mockAdminResponse = {
  staffMetrics: {
    unassigned: 4,
    myAssigned: 1,
    new: 2,
    open: 3,
    inProgress: 2,
    waitingForRequester: 1
  },
  priorityBreakdown: {
    critical: 2,
    high: 3,
    medium: 4,
    low: 1
  },
  userStats: {
    totalUsers: 15,
    activeRequesters: 8,
    activeStaff: 4,
    activeAdmins: 2,
    inactiveUsers: 1
  },
  recentTickets: [
    {
      id: 201,
      ticketNumber: 'TKT-0201',
      summary: 'Database connection pool exhausted',
      status: 'In Progress',
      priority: 'Critical',
      itPriority: 'Critical',
      owner: { id: 2, name: 'Alice Staff' },
      requester: { id: 1, name: 'Charlie Requester' },
      updatedAt: '2026-11-05T11:00:00.000Z'
    }
  ]
};

const mockEmptyResponse = {
  metrics: {
    unassigned: 0,
    myAssigned: 0,
    new: 0,
    open: 0,
    inProgress: 0,
    waitingForRequester: 0
  },
  priorityBreakdown: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  },
  recentTickets: []
};

const mockAdminEmptyQueueResponse = {
  staffMetrics: {
    unassigned: 0,
    myAssigned: 0,
    new: 0,
    open: 0,
    inProgress: 0,
    waitingForRequester: 0
  },
  priorityBreakdown: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  },
  userStats: {
    totalUsers: 20,
    activeRequesters: 12,
    activeStaff: 5,
    activeAdmins: 3,
    inactiveUsers: 0
  },
  recentTickets: []
};

describe('StaffDashboard Component (Issue #59 / Lab 4)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockStaffUser,
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
  // UI-DASH-04: StaffDashboard renders 6 metric cards, quick actions, 4 UI states
  // --------------------------------------------------------------------------
  describe('UI-DASH-04: Renders 6 metric cards, priority pills, quick actions, and 4 UI states', () => {
    it('displays loading skeleton placeholders while fetching data', async () => {
      let resolveFetch: any;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { container } = render(<StaffDashboard />);

      const placeholders = container.querySelectorAll('.placeholder-glow');
      expect(placeholders.length).toBeGreaterThan(0);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => mockStaffResponse
        });
      });
    });

    it('renders all 6 metric cards, priority pills, table, and quick actions omitting + Create Ticket', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStaffResponse
      });

      await act(async () => {
        render(<StaffDashboard />);
      });

      // Greeting
      expect(screen.getByText('Welcome back, Alice Staff!')).toBeDefined();

      // Metric Cards (6 cards)
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
      expect(screen.getAllByText('4').length).toBeGreaterThan(0);

      expect(screen.getByText('My Assigned')).toBeDefined();
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);

      expect(screen.getAllByText('New').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);

      expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);

      expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);

      expect(screen.getByText('Waiting')).toBeDefined();
      expect(screen.getAllByText('1').length).toBeGreaterThan(0);

      // Priority Breakdown pills
      expect(screen.getByRole('button', { name: /Critical/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /High/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Medium/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Low/i })).toBeDefined();

      // Table of Recently Updated Queue
      expect(screen.getByText('Recently Updated Queue')).toBeDefined();
      expect(screen.getByText('TKT-0201')).toBeDefined();
      expect(screen.getByText('Database connection pool exhausted')).toBeDefined();
      expect(screen.getByText('TKT-0202')).toBeDefined();
      expect(screen.getByText('New employee workstation setup')).toBeDefined();

      // Quick Actions (strictly IT Staff / Admin actions)
      expect(screen.getByText('Search Tickets')).toBeDefined();
      expect(screen.getByText('My Queue')).toBeDefined();
      expect(screen.getByText('Unassigned Queue')).toBeDefined();

      // Confirms absence of + Create Ticket button
      expect(screen.queryByText('+ Create Ticket')).toBeNull();
      expect(screen.queryByText('Create Ticket')).toBeNull();

      // Confirms absence of User Administration summary card for non-admin
      expect(screen.queryByText('User Administration Summary')).toBeNull();
      expect(screen.queryByText('Manage Users →')).toBeNull();
    });

    it('renders Empty state when all active queue metrics are 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmptyResponse
      });

      await act(async () => {
        render(<StaffDashboard />);
      });

      expect(
        screen.getByText('No active tickets in queue. Great job! All issues are currently resolved.')
      ).toBeDefined();
    });

    it('renders Forbidden state when server returns HTTP 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' })
      });

      await act(async () => {
        render(<StaffDashboard />);
      });

      expect(screen.getByText('Access Denied')).toBeDefined();
      expect(
        screen.getByText('Staff dashboard is available only to IT Staff and Administrators.')
      ).toBeDefined();
    });

    it('renders Forbidden state when user role is Requester', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      await act(async () => {
        render(<StaffDashboard />);
      });

      expect(screen.getByText('Access Denied')).toBeDefined();
      expect(
        screen.getByText('Staff dashboard is available only to IT Staff and Administrators.')
      ).toBeDefined();
    });

    it('renders Safe Failure state on 500 error and retries upon clicking Retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database timeout' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockStaffResponse
        });

      await act(async () => {
        render(<StaffDashboard />);
      });

      expect(screen.getByText('Unable to load dashboard data.')).toBeDefined();
      const retryBtn = screen.getByText('Retry Loading Dashboard');
      expect(retryBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Welcome back, Alice Staff!')).toBeDefined();
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // UI-DASH-05: Administrator variant renders Staff metrics + User Administration
  // --------------------------------------------------------------------------
  describe('UI-DASH-05: Administrator Dashboard renders User Administration Summary & links', () => {
    it('calls /api/dashboard/admin and renders all 5 user counts and Manage Users button', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAdminResponse
      });

      const onNavigateToUsers = vi.fn();

      await act(async () => {
        render(<StaffDashboard onNavigateToUsers={onNavigateToUsers} />);
      });

      // Verify endpoint called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/dashboard/admin'),
        expect.anything()
      );

      // Verify User Administration Summary card
      const adminCard = screen.getByText('User Administration Summary').closest('.card') as HTMLElement;
      expect(adminCard).toBeDefined();

      // Verify all 5 user metrics scoped to adminCard
      expect(within(adminCard).getByText('Total Users')).toBeDefined();
      expect(within(adminCard).getByText('15')).toBeDefined();

      expect(within(adminCard).getByText('Active Requesters')).toBeDefined();
      expect(within(adminCard).getByText('8')).toBeDefined();

      expect(within(adminCard).getByText('Active Staff')).toBeDefined();
      expect(within(adminCard).getByText('4')).toBeDefined();

      expect(within(adminCard).getByText('Active Admins')).toBeDefined();
      expect(within(adminCard).getByText('2')).toBeDefined();

      expect(within(adminCard).getByText('Inactive Accounts')).toBeDefined();
      expect(within(adminCard).getByText('1')).toBeDefined();

      // Click Manage Users → button
      const manageUsersBtn = screen.getByText('Manage Users →');
      expect(manageUsersBtn).toBeDefined();
      fireEvent.click(manageUsersBtn);

      expect(onNavigateToUsers).toHaveBeenCalledTimes(1);
    });

    it('displays loading skeletons including User Administration Summary while Administrator fetches data', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      let resolveFetch: any;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { container } = render(<StaffDashboard />);

      // Verify User Administration Summary card is present with skeleton placeholders
      expect(screen.getByText('User Administration Summary')).toBeDefined();
      const placeholders = container.querySelectorAll('.placeholder-glow');
      expect(placeholders.length).toBeGreaterThan(0);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => mockAdminResponse
        });
      });
    });

    it('renders empty queue message while preserving real User Statistics when operational queue is empty', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAdminEmptyQueueResponse
      });

      await act(async () => {
        render(<StaffDashboard />);
      });

      // Operational queue is empty: displays zero queue alert
      expect(
        screen.getByText('No active tickets in queue. Great job! All issues are currently resolved.')
      ).toBeDefined();

      // Real User Statistics are still displayed
      const adminCard = screen.getByText('User Administration Summary').closest('.card') as HTMLElement;
      expect(within(adminCard).getByText('Total Users')).toBeDefined();
      expect(within(adminCard).getByText('20')).toBeDefined();
      expect(within(adminCard).getByText('Active Requesters')).toBeDefined();
      expect(within(adminCard).getByText('12')).toBeDefined();
      expect(within(adminCard).getByText('Active Staff')).toBeDefined();
      expect(within(adminCard).getByText('5')).toBeDefined();
      expect(within(adminCard).getByText('Active Admins')).toBeDefined();
      expect(within(adminCard).getByText('3')).toBeDefined();
      expect(within(adminCard).getByText('Inactive Accounts')).toBeDefined();
      expect(within(adminCard).getByText('0')).toBeDefined();
    });

    it('renders Safe Failure and retries loading Administrator dashboard upon clicking retry', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database timeout' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAdminResponse
        });

      await act(async () => {
        render(<StaffDashboard />);
      });

      expect(screen.getByText('Unable to load dashboard data.')).toBeDefined();
      const retryBtn = screen.getByText('Retry Loading Dashboard');
      expect(retryBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('User Administration Summary')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Drill-down callbacks & Quick Actions verification
  // --------------------------------------------------------------------------
  describe('Drill-down filters and Quick Action triggers', () => {
    it('triggers onNavigateToQueue with proper parameters when clicking metric cards and pills', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStaffResponse
      });

      const onNavigateToQueue = vi.fn();
      const onTicketClick = vi.fn();

      await act(async () => {
        render(
          <StaffDashboard
            onNavigateToQueue={onNavigateToQueue}
            onTicketClick={onTicketClick}
          />
        );
      });

      // Unassigned card -> ownerId: 'Unassigned'
      const unassignedCard = screen.getAllByText('Unassigned')[0].closest('.card')!;
      fireEvent.click(unassignedCard.querySelector('button')!);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ ownerId: 'Unassigned' });

      // My Assigned card -> ownerId: '2' (staff user id)
      const myAssignedCard = screen.getByText('My Assigned').closest('.card')!;
      fireEvent.click(myAssignedCard.querySelector('button')!);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ ownerId: '2' });

      // Priority pills
      const critPill = screen.getByRole('button', { name: /Critical/i });
      fireEvent.click(critPill);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ itPriority: 'Critical', scope: 'active' });

      const highPill = screen.getByRole('button', { name: /High/i });
      fireEvent.click(highPill);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ itPriority: 'High', scope: 'active' });

      const medPill = screen.getByRole('button', { name: /Medium/i });
      fireEvent.click(medPill);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ itPriority: 'Medium', scope: 'active' });

      const lowPill = screen.getByRole('button', { name: /Low/i });
      fireEvent.click(lowPill);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ itPriority: 'Low', scope: 'active' });

      // Quick Actions
      const searchBtn = screen.getByText('Search Tickets');
      fireEvent.click(searchBtn);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ focusSearch: true });

      const myQueueBtn = screen.getByText('My Queue');
      fireEvent.click(myQueueBtn);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ ownerId: '2' });

      const unassignedQueueBtn = screen.getByText('Unassigned Queue');
      fireEvent.click(unassignedQueueBtn);
      expect(onNavigateToQueue).toHaveBeenCalledWith({ ownerId: 'Unassigned' });

      // Table row click -> onTicketClick(201)
      const ticketRow = screen.getByText('Database connection pool exhausted').closest('tr')!;
      fireEvent.click(ticketRow);
      expect(onTicketClick).toHaveBeenCalledWith(201);
    });
  });
});
