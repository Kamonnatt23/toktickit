import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StaffTicketDetail } from '../../src/components/StaffTicketDetail';
import { CommunicationArea } from '../../src/components/CommunicationArea';
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

const baseTicket = {
  id: 101,
  ticketNumber: 'TKT-0101',
  summary: 'Network connectivity failing in Building B',
  description: 'Employees reporting frequent packet loss and drops.',
  status: 'In Progress',
  priority: 'High',
  itPriority: 'High',
  requesterId: 1,
  requester: { id: 1, name: 'Charlie Requester', email: 'charlie@example.com' },
  ownerId: 2,
  owner: { id: 2, name: 'Alice Staff', email: 'alice@example.com' },
  category: { id: 1, name: 'Network' },
  relatedSystem: { id: 1, name: 'Switch B' },
  attachments: [],
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z'
};

const mockAction = {
  id: 1,
  ticketId: 101,
  performedById: 2,
  performedBy: { id: 2, name: 'Alice Staff', role: 'IT Staff', email: 'alice@example.com' },
  actionDateTime: '2026-11-01T09:30:00.000Z',
  actionDescription: 'Replaced faulty SFP+ module',
  result: 'Link stabilized, ping loss dropped to 0%',
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  createdAt: '2026-11-01T09:35:00.000Z',
  updatedAt: '2026-11-01T09:35:00.000Z'
};

function setupFetchMock(ticketData: any = baseTicket, actionsData: any[] = []) {
  return vi.fn(async (url: string | URL | Request, options?: any) => {
    const urlStr = url.toString();
    const method = options?.method || 'GET';

    if (urlStr.includes('/api/staff/users')) {
      return {
        ok: true,
        json: async () => ({ data: [mockStaffUser] })
      };
    }

    if (urlStr.includes('/api/tickets/') && urlStr.endsWith('/actions')) {
      return {
        ok: true,
        json: async () => actionsData
      };
    }

    if (urlStr.includes('/api/tickets/') && urlStr.endsWith('/comments')) {
      return {
        ok: true,
        json: async () => []
      };
    }

    if (urlStr.includes('/api/tickets/') && urlStr.endsWith('/notes')) {
      return {
        ok: true,
        json: async () => []
      };
    }

    if (urlStr.includes(`/api/tickets/${ticketData.id}`) && !urlStr.includes('/status') && !urlStr.includes('/assign')) {
      return {
        ok: true,
        json: async () => ticketData
      };
    }

    return {
      ok: true,
      json: async () => ({})
    };
  });
}

describe('Ticket Workflow & Resolution Rules (Issue #58 / Lab 4)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
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
  // UI-WF-01: Resolution Gate blocks transition if 0 actions
  // --------------------------------------------------------------------------
  describe('UI-WF-01: Resolution Gate blocks when 0 actions taken', () => {
    it('renders warning alert, provides [+ Log Action Taken] link, and disables Confirm button when selecting Resolved with 0 actions', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'In Progress' }, []);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      // Status select dropdown
      const statusSelect = screen.getByLabelText(/update ticket status/i);
      expect(statusSelect).toBeInTheDocument();

      // Change status to Resolved
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Resolved' } });
      });

      // Verification: Resolution Gate warning banner is rendered
      const warningBanner = screen.getByRole('alert');
      expect(warningBanner).toHaveTextContent(/Resolution Gate: At least one Action Taken must be recorded before resolving this ticket/i);

      // Verification: [+ Log Action Taken] button is visible
      const logActionBtn = screen.getByRole('button', { name: /\[\+ Log Action Taken\]/i });
      expect(logActionBtn).toBeInTheDocument();

      // Verification: Confirm Status Change button is disabled
      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      expect(confirmBtn).toBeDisabled();

      // Verification: Resolution Details textarea is not rendered when gate is blocked
      expect(screen.queryByPlaceholderText(/explain the fix to the requester/i)).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // UI-WF-02: Resolution Gate passes when >= 1 action taken
  // --------------------------------------------------------------------------
  describe('UI-WF-02: Resolution Gate passes when >= 1 action taken', () => {
    it('hides warning banner, immediately enables Confirm button, renders optional resolution textarea when actions exist', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'In Progress' }, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);

      // Change status to Resolved
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Resolved' } });
      });

      // Warning banner should NOT be rendered
      expect(screen.queryByText(/Resolution Gate: At least one Action Taken must be recorded/i)).not.toBeInTheDocument();

      // Confirm Status Change button is immediately enabled
      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      expect(confirmBtn).not.toBeDisabled();

      // Optional resolution comment textarea is rendered with helper subtext
      const commentInput = screen.getByPlaceholderText(/explain the fix to the requester/i);
      expect(commentInput).toBeInTheDocument();
      expect(screen.getByText(/Optional: Explain the fix to the requester. If left blank, the ticket will be resolved without creating an empty comment./i)).toBeInTheDocument();

      // Fill in resolution comment and submit
      fireEvent.change(commentInput, { target: { value: 'Replaced SFP+ transceiver and tested connection.' } });

      mockFetch.mockImplementation(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/staff/tickets/101/status') && options?.method === 'PATCH') {
          const body = JSON.parse(options.body);
          expect(body.status).toBe('Resolved');
          expect(body.lastUpdatedAt).toBe(baseTicket.updatedAt);
          expect(body.comment).toBe('Replaced SFP+ transceiver and tested connection.');
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...baseTicket, status: 'Resolved', resolvedAt: '2026-11-01T10:30:00.000Z' })
          };
        }
        return setupFetchMock({ ...baseTicket, status: 'Resolved' }, [mockAction])(url, options);
      });

      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Status updated successfully/i)).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // UI-WF-03: Permitted transition options match 13-row transition matrix
  // --------------------------------------------------------------------------
  describe('UI-WF-03: Status dropdown displays only valid transitions from 13-row matrix', () => {
    it.each([
      ['New', ['Open', 'Cancelled']],
      ['Open', ['In Progress', 'Waiting for Requester']],
      ['Waiting for Requester', ['In Progress', 'Open']],
      ['In Progress', ['Resolved', 'Waiting for Requester']],
      ['Resolved', ['Closed']],
      ['Closed', ['Reopened']],
      ['Reopened', ['In Progress', 'Open', 'Waiting for Requester']],
      ['Cancelled', []]
    ])('renders correct target options for status %s', async (startingStatus, expectedTargets) => {
      mockFetch = setupFetchMock({ ...baseTicket, status: startingStatus }, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      if (expectedTargets.length === 0) {
        // Cancelled has no outgoing transitions
        expect(screen.queryByLabelText(/update ticket status/i)).not.toBeInTheDocument();
      } else {
        const statusSelect = screen.getByLabelText(/update ticket status/i) as HTMLSelectElement;
        const options = Array.from(statusSelect.options).map(opt => opt.value);
        expect(options[0]).toBe(startingStatus); // Current status
        expect(options.slice(1)).toEqual(expectedTargets);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Exact source-target owner requirement validation feedback
  // --------------------------------------------------------------------------
  describe('Owner assignment requirement validation feedback', () => {
    it.each([
      ['New', 'Open', true],
      ['Open', 'In Progress', true],
      ['Reopened', 'In Progress', true],
      ['Waiting for Requester', 'Open', false],
      ['Waiting for Requester', 'In Progress', false],
      ['Reopened', 'Open', false],
      ['Reopened', 'Waiting for Requester', false]
    ])('evaluates owner requirement correctly for transition %s -> %s (requires owner: %s)', async (source, target, requiresOwner) => {
      const unassignedTicket = {
        ...baseTicket,
        status: source,
        ownerId: null,
        owner: null
      };

      mockFetch = setupFetchMock(unassignedTicket, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: target } });
      });

      const expectedMsg = `Ticket must be assigned to an owner before transitioning from '${source}' to '${target}'.`;

      if (requiresOwner) {
        expect(screen.getByText(expectedMsg)).toBeInTheDocument();
        const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
        expect(confirmBtn).toBeDisabled();
      } else {
        expect(screen.queryByText(expectedMsg)).not.toBeInTheDocument();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Cancellation and Reopen reasons & Waiting comment validation
  // --------------------------------------------------------------------------
  describe('Reason and Comment validation on status transitions', () => {
    it('requires cancellation reason when transitioning New -> Cancelled', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'New', ownerId: null, owner: null }, []);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Cancelled' } });
      });

      const reasonInput = screen.getByPlaceholderText(/cancellation reason \(required\)/i);
      expect(reasonInput).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(reasonInput, { target: { value: 'Duplicate issue logged in error' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('requires reopen reason when transitioning Closed -> Reopened', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'Closed' }, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Reopened' } });
      });

      const reasonInput = screen.getByPlaceholderText(/reopen reason \(required\)/i);
      expect(reasonInput).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(reasonInput, { target: { value: 'Issue re-occurred after reboot' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('requires public comment when transitioning Open -> Waiting for Requester', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'Open' }, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Waiting for Requester' } });
      });

      const commentInput = screen.getByPlaceholderText(/public comment \(required\)/i);
      expect(commentInput).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(commentInput, { target: { value: 'Please provide the MAC address of your device.' } });
      expect(confirmBtn).not.toBeDisabled();
    });
  });

  // --------------------------------------------------------------------------
  // Concurrency CAS (409 Conflict) Handling in StaffTicketDetail
  // --------------------------------------------------------------------------
  describe('Concurrency CAS (409 Conflict) handling', () => {
    it('catches 409 Conflict on status change, preserves user draft input, and shows Reload Latest Data button', async () => {
      mockFetch = setupFetchMock({ ...baseTicket, status: 'Closed' }, [mockAction]);
      global.fetch = mockFetch;

      await act(async () => {
        render(<StaffTicketDetail ticketId={101} onBack={vi.fn()} />);
      });

      const statusSelect = screen.getByLabelText(/update ticket status/i);
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'Reopened' } });
      });

      const reasonInput = screen.getByPlaceholderText(/reopen reason \(required\)/i) as HTMLTextAreaElement;
      fireEvent.change(reasonInput, { target: { value: 'Unsaved draft reopen reason' } });

      // Mock PATCH returning 409 Conflict
      mockFetch.mockImplementation(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/staff/tickets/101/status') && options?.method === 'PATCH') {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: 'Ticket was modified by another user. Please reload the latest ticket details.'
            })
          };
        }
        return setupFetchMock({ ...baseTicket, status: 'Closed' }, [mockAction])(url, options);
      });

      const confirmBtn = screen.getByRole('button', { name: /confirm status change/i });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // Verify draft inputs are preserved
      expect(reasonInput.value).toBe('Unsaved draft reopen reason');

      // Verify conflict notice and reload button are rendered
      expect(screen.getByText(/Concurrency Notice:/i)).toBeInTheDocument();
      expect(screen.getByText(/Ticket was modified by another user/i)).toBeInTheDocument();
      const reloadBtn = screen.getByRole('button', { name: /reload latest data/i });
      expect(reloadBtn).toBeInTheDocument();

      // Click reload button
      await act(async () => {
        fireEvent.click(reloadBtn);
      });

      // Draft reason is still in the textarea for user to review
      expect(reasonInput.value).toBe('Unsaved draft reopen reason');
    });
  });

  // --------------------------------------------------------------------------
  // CommunicationArea integration: lastUpdatedAt, appears-resolved, and 409 handling
  // --------------------------------------------------------------------------
  describe('CommunicationArea integration', () => {
    it('passes lastUpdatedAt in public comments and handles 409 conflict with draft preservation', async () => {
      mockFetch = vi.fn(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/tickets/101/comments') && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          expect(body.lastUpdatedAt).toBe('2026-11-01T10:00:00.000Z');
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: 'Ticket was modified in another session. Your draft comment has been preserved.'
            })
          };
        }
        if (urlStr.includes('/api/tickets/101/comments')) {
          return { ok: true, json: async () => [] };
        }
        if (urlStr.includes('/api/tickets/101/notes')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = mockFetch;

      await act(async () => {
        render(
          <CommunicationArea
            ticketId={101}
            ticketStatus="In Progress"
            lastUpdatedAt="2026-11-01T10:00:00.000Z"
            onUpdate={vi.fn()}
          />
        );
      });

      const textarea = screen.getByPlaceholderText(/type your message here\.\.\./i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'My detailed comment that collided' } });

      const postBtn = screen.getByRole('button', { name: /post message/i });
      await act(async () => {
        fireEvent.click(postBtn);
      });

      // Conflict alert shown and draft preserved
      expect(screen.getByText(/Ticket was modified in another session\. Your draft comment has been preserved\./i)).toBeInTheDocument();
      expect(textarea.value).toBe('My detailed comment that collided');
      expect(screen.getByRole('button', { name: /reload latest data/i })).toBeInTheDocument();
    });

    it('renders Problem Appears Resolved button only for Requester when status is In Progress', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch = vi.fn(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/tickets/101/appears-resolved') && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          expect(body.lastUpdatedAt).toBe('2026-11-01T10:00:00.000Z');
          return {
            ok: true,
            status: 201,
            json: async () => ({ message: 'Ticket marked as appears resolved' })
          };
        }
        return { ok: true, json: async () => [] };
      });
      global.fetch = mockFetch;

      const { rerender } = render(
        <CommunicationArea
          ticketId={101}
          ticketStatus="In Progress"
          lastUpdatedAt="2026-11-01T10:00:00.000Z"
          onUpdate={vi.fn()}
        />
      );

      // Button is visible when In Progress
      const appearsBtn = screen.getByRole('button', { name: /problem appears resolved/i });
      expect(appearsBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(appearsBtn);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tickets/101/appears-resolved'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ lastUpdatedAt: '2026-11-01T10:00:00.000Z' })
        })
      );

      // When ticket status is Open, button is hidden
      rerender(
        <CommunicationArea
          ticketId={101}
          ticketStatus="Open"
          lastUpdatedAt="2026-11-01T10:00:00.000Z"
          onUpdate={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /problem appears resolved/i })).not.toBeInTheDocument();
    });

    it('reuses Idempotency-Key across retries for public comments and generates a new key after success', async () => {
      const capturedKeys: string[] = [];
      let attempt = 0;

      mockFetch = vi.fn(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/tickets/101/comments') && options?.method === 'POST') {
          capturedKeys.push(options.headers['Idempotency-Key']);
          attempt++;
          if (attempt === 1) {
            // First attempt fails with network/server error
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: 'Internal Server Error' })
            };
          }
          // Second attempt succeeds
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 1,
              content: 'Test comment',
              createdAt: '2026-11-01T10:05:00.000Z',
              author: { id: 2, name: 'Alice Staff', role: 'IT Staff' }
            })
          };
        }
        if (urlStr.includes('/api/tickets/101/comments')) {
          return { ok: true, json: async () => [] };
        }
        if (urlStr.includes('/api/tickets/101/notes')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = mockFetch;

      await act(async () => {
        render(
          <CommunicationArea
            ticketId={101}
            ticketStatus="In Progress"
            lastUpdatedAt="2026-11-01T10:00:00.000Z"
            onUpdate={vi.fn()}
          />
        );
      });

      const textarea = screen.getByPlaceholderText(/type your message here\.\.\./i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'First logical message' } });

      const postBtn = screen.getByRole('button', { name: /post message/i });

      // First click: fails (500)
      await act(async () => {
        fireEvent.click(postBtn);
      });
      expect(screen.getByText('Internal Server Error')).toBeInTheDocument();

      // Retry click: succeeds
      await act(async () => {
        fireEvent.click(postBtn);
      });

      // Verification: same key reused across retry
      expect(capturedKeys.length).toBe(2);
      expect(capturedKeys[0]).toBeTruthy();
      expect(capturedKeys[0]).toBe(capturedKeys[1]);

      // Now create a second distinct message: should receive a new key
      fireEvent.change(textarea, { target: { value: 'Second logical message' } });
      await act(async () => {
        fireEvent.click(postBtn);
      });

      expect(capturedKeys.length).toBe(3);
      expect(capturedKeys[2]).toBeTruthy();
      expect(capturedKeys[2]).not.toBe(capturedKeys[0]);
    });

    it('reuses Idempotency-Key across retries for appears-resolved and generates a new key after success', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      const capturedKeys: string[] = [];
      let attempt = 0;

      mockFetch = vi.fn(async (url: string | URL | Request, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/tickets/101/appears-resolved') && options?.method === 'POST') {
          capturedKeys.push(options.headers['Idempotency-Key']);
          attempt++;
          if (attempt === 1) {
            // First attempt fails with 409 conflict
            return {
              ok: false,
              status: 409,
              json: async () => ({ error: 'Conflict' })
            };
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({ message: 'Advisory resolution logged' })
          };
        }
        return { ok: true, json: async () => [] };
      });
      global.fetch = mockFetch;

      await act(async () => {
        render(
          <CommunicationArea
            ticketId={101}
            ticketStatus="In Progress"
            lastUpdatedAt="2026-11-01T10:00:00.000Z"
            onUpdate={vi.fn()}
          />
        );
      });

      const appearsBtn = screen.getByRole('button', { name: /problem appears resolved/i });

      // First click: fails (409)
      await act(async () => {
        fireEvent.click(appearsBtn);
      });

      // Second click: retry succeeds
      await act(async () => {
        fireEvent.click(appearsBtn);
      });

      // Verification: same key was reused across the retry
      expect(capturedKeys.length).toBe(2);
      expect(capturedKeys[0]).toBeTruthy();
      expect(capturedKeys[0]).toBe(capturedKeys[1]);

      // Third click (new logical attempt): gets a fresh key
      await act(async () => {
        fireEvent.click(appearsBtn);
      });

      expect(capturedKeys.length).toBe(3);
      expect(capturedKeys[2]).toBeTruthy();
      expect(capturedKeys[2]).not.toBe(capturedKeys[0]);
    });
  });
});
