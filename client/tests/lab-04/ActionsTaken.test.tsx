import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { ActionsTaken, CreateActionModal, EditActionModal, RevisionHistoryModal } from '../../src/components/ActionsTaken';
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
  email: 'admin@example.com',
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

const mockActionsList = [
  {
    id: 10,
    ticketId: 1,
    performedById: 2,
    performedBy: { id: 2, name: 'Alice Staff', role: 'IT Staff', email: 'alice@example.com' },
    actionDateTime: '2026-11-01T09:00:00.000Z',
    actionDescription: 'Checked router cables and swapped port',
    result: 'Link lights blinking, initial handshake established',
    followUpRequired: true,
    followUpNote: 'Check again tomorrow morning',
    attachmentNotes: 'port-log.txt',
    createdAt: '2026-11-01T09:05:00.000Z',
    updatedAt: '2026-11-01T09:05:00.000Z'
  },
  {
    id: 20,
    ticketId: 1,
    performedById: 2,
    performedBy: { id: 2, name: 'Alice Staff', role: 'IT Staff', email: 'alice@example.com' },
    actionDateTime: '2026-11-01T14:30:00.000Z',
    actionDescription: 'Configured VLAN tagging and ran speed test',
    result: '1000 Mbps throughput verified',
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    createdAt: '2026-11-01T14:35:00.000Z',
    updatedAt: '2026-11-01T14:35:00.000Z'
  }
];

const mockRevisionsList = [
  {
    id: 101,
    actionTakenId: 10,
    editedById: 3,
    editedBy: { id: 3, name: 'Bob Admin', role: 'Administrator', email: 'admin@example.com' },
    editedAt: '2026-11-01T11:00:00.000Z',
    beforeSnapshot: {
      actionDateTime: '2026-11-01T09:00:00.000Z',
      actionDescription: 'Checked router cables',
      result: 'Link lights blinking',
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null
    },
    afterSnapshot: {
      actionDateTime: '2026-11-01T09:00:00.000Z',
      actionDescription: 'Checked router cables and swapped port',
      result: 'Link lights blinking, initial handshake established',
      followUpRequired: true,
      followUpNote: 'Check again tomorrow morning',
      attachmentNotes: 'port-log.txt'
    }
  }
];

describe('ActionsTaken Component & Modals (Issue #57 / Lab 4)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // UI-ACT-01: Timeline rendering & Add button visibility by role
  // --------------------------------------------------------------------------
  describe('UI-ACT-01: Timeline rendering and role-based visibility', () => {
    it('renders Actions Taken section in chronological order and + Add Action Taken button for IT Staff', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[1], mockActionsList[0]] // Return out of order to test client sort
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Header with count
      expect(screen.getByText('Actions Taken (2)')).toBeDefined();

      // + Add Action Taken button visible for Staff
      expect(screen.getByText('+ Add Action Taken')).toBeDefined();

      // Check actions rendered
      expect(screen.getByText('Checked router cables and swapped port')).toBeDefined();
      expect(screen.getByText('Configured VLAN tagging and ran speed test')).toBeDefined();

      // Check Edit and View History buttons present for Staff
      const editButtons = screen.getAllByLabelText('Edit Action Taken');
      expect(editButtons.length).toBe(2);

      const historyButtons = screen.getAllByLabelText('View Action Taken Revision History');
      expect(historyButtons.length).toBe(2);

      // Verify chronological order: action 10 (09:00) should appear before action 20 (14:30)
      const descriptions = screen.getAllByText(/Checked router cables|Configured VLAN tagging/);
      expect(descriptions[0].textContent).toContain('Checked router cables');
      expect(descriptions[1].textContent).toContain('Configured VLAN tagging');
    });

    it('renders + Add Action Taken button for Administrator', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockAdminUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActionsList
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      expect(screen.getByText('+ Add Action Taken')).toBeDefined();
      expect(screen.getAllByLabelText('Edit Action Taken').length).toBe(2);
      expect(screen.getAllByLabelText('View Action Taken Revision History').length).toBe(2);
    });

    it('hides + Add Action Taken, Edit, and View History buttons for Requester', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActionsList
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      expect(screen.getByText('Actions Taken (2)')).toBeDefined();
      expect(screen.queryByText('+ Add Action Taken')).toBeNull();
      expect(screen.queryByLabelText('Edit Action Taken')).toBeNull();
      expect(screen.queryByLabelText('View Action Taken Revision History')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-02: Add Action Taken form behavior and Idempotency-Key lifecycle
  // --------------------------------------------------------------------------
  describe('UI-ACT-02: Create form validation & Idempotency-Key lifecycle', () => {
    it('manages follow-up requirement, disables submit with spinner, and handles single-key retry lifecycle', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      // 1. Initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Empty state visible for Staff
      expect(screen.getByText("No actions recorded yet. Click '+ Add Action Taken' to log initial technical work.")).toBeDefined();

      // 2. Open Create Modal
      fireEvent.click(screen.getByText('+ Add Action Taken'));
      expect(screen.getByText('Log Action Taken')).toBeDefined();
      expect(screen.getByText(/Will be recorded as: Alice Staff \(IT Staff\)/)).toBeDefined();

      const descInput = screen.getByPlaceholderText('Describe the technical action performed...');
      const resultInput = screen.getByPlaceholderText('Describe the observed result or outcome...');
      const followUpSwitch = screen.getByRole('switch');
      const submitBtn = screen.getByText('Save Action Taken');

      // Submit should be disabled initially (empty required fields)
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      // Fill in description & result
      fireEvent.change(descInput, { target: { value: 'Replaced thermal paste on CPU' } });
      fireEvent.change(resultInput, { target: { value: 'Idle temp dropped from 75C to 42C' } });

      // Now form should be valid
      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      // (1) Toggle follow-up switch ON
      fireEvent.click(followUpSwitch);
      expect(screen.getByPlaceholderText('Specify required follow-up details...')).toBeDefined();
      // Form should now be disabled because followUpNote is blank
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      // Enter note
      const followUpNoteInput = screen.getByPlaceholderText('Specify required follow-up details...');
      fireEvent.change(followUpNoteInput, { target: { value: 'Monitor temperature during next stress test' } });
      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      // (2) Toggle switch OFF -> note should be hidden and sent as null
      fireEvent.click(followUpSwitch);
      expect(screen.queryByPlaceholderText('Specify required follow-up details...')).toBeNull();
      expect(submitBtn.hasAttribute('disabled')).toBe(false);

      // (3) First submission attempt simulates network error / 500 failure
      mockFetch.mockRejectedValueOnce(new Error('Network error on submit'));

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Verifies first request had valid UUIDv4 Idempotency-Key
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 for initial list, 1 for create
      const firstCallArgs = mockFetch.mock.calls[1];
      const firstUrl = firstCallArgs[0];
      const firstOptions = firstCallArgs[1];

      expect(firstUrl).toContain('/api/tickets/1/actions');
      expect(firstOptions.method).toBe('POST');
      const firstKey = firstOptions.headers['Idempotency-Key'];
      const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(firstKey).toMatch(uuidv4Regex);

      // Sent followUpNote as null since switch was turned off
      const parsedFirstBody = JSON.parse(firstOptions.body);
      expect(parsedFirstBody.followUpRequired).toBe(false);
      expect(parsedFirstBody.followUpNote).toBeNull();
      expect(parsedFirstBody.actionDescription).toBe('Replaced thermal paste on CPU');

      // (4) Form remains open, error shown, draft preserved
      expect(screen.getByText('Log Action Taken')).toBeDefined();
      expect(screen.getByText(/Network error/)).toBeDefined();
      expect((descInput as HTMLTextAreaElement).value).toBe('Replaced thermal paste on CPU');

      // (5) Retry submission -> must REUSE identical Idempotency-Key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 99, ...parsedFirstBody })
      });
      // And refresh fetch after success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 99, ...parsedFirstBody, performedBy: mockStaffUser, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Save Action Taken'));
      });

      const secondCallArgs = mockFetch.mock.calls[2];
      const secondKey = secondCallArgs[1].headers['Idempotency-Key'];
      // Key must be strictly identical across retries!
      expect(secondKey).toBe(firstKey);

      // Modal closed on success
      await waitFor(() => {
        expect(screen.queryByText('Log Action Taken')).toBeNull();
      });

      // (6) Now open Create modal again for a NEW submission -> must generate a FRESH key
      fireEvent.click(screen.getByText('+ Add Action Taken'));
      expect(screen.getByText('Log Action Taken')).toBeDefined();

      const newDescInput = screen.getByPlaceholderText('Describe the technical action performed...');
      const newResultInput = screen.getByPlaceholderText('Describe the observed result or outcome...');
      fireEvent.change(newDescInput, { target: { value: 'Second action work' } });
      fireEvent.change(newResultInput, { target: { value: 'Second action outcome' } });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 100 })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Save Action Taken'));
      });

      // Find third create call
      const createCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(createCalls.length).toBe(3); // call 1 (failed), call 2 (retry), call 3 (new submission)
      const thirdKey = createCalls[2][1].headers['Idempotency-Key'];
      expect(thirdKey).toMatch(uuidv4Regex);
      expect(thirdKey).not.toBe(firstKey); // Fresh key!
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-03: Staff edit form behavior and CAS token
  // --------------------------------------------------------------------------
  describe('UI-ACT-03: Edit form values, immutable actor, and CAS token', () => {
    it('populates fields, shows immutable performer, and attaches actionLastUpdatedAt in PATCH', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Click Edit Action
      fireEvent.click(screen.getByLabelText('Edit Action Taken'));
      expect(screen.getByText('Edit Action Taken')).toBeDefined();

      // Read-only original actor
      expect(screen.getByText(/Originally recorded by: Alice Staff \(IT Staff\)/)).toBeDefined();
      expect(screen.getByText('Performer identity remains permanently immutable.')).toBeDefined();

      // Fields populated
      const descInput = screen.getByPlaceholderText('Describe the technical action performed...') as HTMLTextAreaElement;
      expect(descInput.value).toBe('Checked router cables and swapped port');

      const resultInput = screen.getByPlaceholderText('Describe the observed result or outcome...') as HTMLTextAreaElement;
      expect(resultInput.value).toBe('Link lights blinking, initial handshake established');

      const followUpNoteInput = screen.getByPlaceholderText('Specify required follow-up details...') as HTMLTextAreaElement;
      expect(followUpNoteInput.value).toBe('Check again tomorrow morning');

      // Modify description
      fireEvent.change(descInput, { target: { value: 'Updated description after full test' } });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockActionsList[0], actionDescription: 'Updated description after full test' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ ...mockActionsList[0], actionDescription: 'Updated description after full test' }]
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Save Changes'));
      });

      // Verify PATCH call
      const patchCall = mockFetch.mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      if (!patchCall) throw new Error('PATCH call was not found');
      expect(patchCall[0]).toContain('/api/tickets/1/actions/10');
      const patchBody = JSON.parse(patchCall[1].body);
      expect(patchBody.actionLastUpdatedAt).toBe(mockActionsList[0].updatedAt);
      expect(patchBody.actionDescription).toBe('Updated description after full test');
      expect(patchBody.result).toBe('Link lights blinking, initial handshake established');
      expect(patchBody.performedById).toBeUndefined(); // performer not sent or modified
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-04: Edit form 409 Conflict handling & reload
  // --------------------------------------------------------------------------
  describe('UI-ACT-04: HTTP 409 Conflict alert, draft preservation, and reload', () => {
    it('catches 409 Conflict, preserves unsaved inputs, and reloads latest data on user action', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      fireEvent.click(screen.getByLabelText('Edit Action Taken'));
      const descInput = screen.getByPlaceholderText('Describe the technical action performed...') as HTMLTextAreaElement;

      // User types a new draft
      fireEvent.change(descInput, { target: { value: 'My custom unsaved edit draft' } });

      // Server returns 409 Conflict
      mockFetch.mockResolvedValueOnce({
        status: 409,
        ok: false,
        json: async () => ({ error: 'Action Taken was modified by another session. Please reload and try again.' })
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Save Changes'));
      });

      // Modal must remain OPEN
      expect(screen.getByText('Edit Action Taken')).toBeDefined();

      // Conflict alert must be displayed
      expect(screen.getByText(/This Action Taken was modified by another user. Your draft inputs have been preserved./)).toBeDefined();

      // Draft inputs must be preserved!
      expect(descInput.value).toBe('My custom unsaved edit draft');

      // Reload Latest Data button present
      const reloadBtn = screen.getByText('Reload Latest Data');
      expect(reloadBtn).toBeDefined();

      // When user clicks Reload Latest Data
      const freshAction = {
        ...mockActionsList[0],
        actionDescription: 'Updated by another staff member on server',
        updatedAt: '2026-11-01T15:00:00.000Z'
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [freshAction]
      });

      await act(async () => {
        fireEvent.click(reloadBtn);
      });

      // Conflict alert cleared, and draft updated with latest server state
      expect(screen.queryByText(/This Action Taken was modified by another user/)).toBeNull();
      expect(descInput.value).toBe('Updated by another staff member on server');
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-05: Requester read-only timeline
  // --------------------------------------------------------------------------
  describe('UI-ACT-05: Requester read-only timeline', () => {
    it('renders action details in read-only mode without any create, edit, or delete controls', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActionsList
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Action fields rendered
      expect(screen.getByText('Checked router cables and swapped port')).toBeDefined();
      expect(screen.getByText('Link lights blinking, initial handshake established')).toBeDefined();
      expect(screen.getAllByText('Recorded by: Alice Staff').length).toBe(2);
      expect(screen.getByText('Follow-Up Required')).toBeDefined();
      expect(screen.getByText(/Check again tomorrow morning/)).toBeDefined();
      expect(screen.getByText(/📎 File Reference: port-log.txt/)).toBeDefined();

      // No mutation or history buttons
      expect(screen.queryByText('+ Add Action Taken')).toBeNull();
      expect(screen.queryByLabelText('Edit Action Taken')).toBeNull();
      expect(screen.queryByLabelText('View Action Taken Revision History')).toBeNull();
      expect(screen.queryByText('Delete')).toBeNull();
    });

    it('renders requester-appropriate empty message when 0 actions exist', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      expect(screen.getByText('No actions recorded yet. IT Staff will log updates here as work progresses.')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-06: Revision History modal for Staff/Admin
  // --------------------------------------------------------------------------
  describe('UI-ACT-06: Revision history modal with diffs and empty state', () => {
    it('renders populated revisions with before/after diffs in strictly read-only mode', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      // Initial list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Revisions request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRevisionsList
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('View Action Taken Revision History'));
      });

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Revision History - Action Taken #10')).toBeDefined();
      expect(within(dialog).getByText('Revision #1')).toBeDefined();
      expect(within(dialog).getByText(/Edited by: Bob Admin \(Administrator\)/)).toBeDefined();

      // Verify diff comparison fields inside modal
      expect(within(dialog).getByText('Action Date/Time')).toBeDefined();
      expect(within(dialog).getByText('Description')).toBeDefined();
      expect(within(dialog).getByText('Result')).toBeDefined();
      expect(within(dialog).getByText('Follow-Up Required')).toBeDefined();

      // Before & after values
      expect(within(dialog).getByText('Checked router cables')).toBeDefined();
      expect(within(dialog).getByText('Checked router cables and swapped port')).toBeDefined();

      // Strictly read-only: no edit/update/delete controls inside the modal
      expect(screen.queryByText('Edit')).toBeNull();
      expect(screen.queryByText('Delete')).toBeNull();
      expect(screen.queryByText('Save')).toBeNull();

      // Close button exists
      expect(screen.getByLabelText('Close revision history')).toBeDefined();
    });

    it('renders clean no-revisions card when Action Taken has never been edited', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Revisions request returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('View Action Taken Revision History'));
      });

      expect(screen.getByText('No revisions recorded. This Action Taken has not been modified since creation.')).toBeDefined();
    });

    it('handles revision loading failure with retry button', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // Revisions fetch fails
      mockFetch.mockRejectedValueOnce(new Error('Failed to load revisions'));

      await act(async () => {
        fireEvent.click(screen.getByLabelText('View Action Taken Revision History'));
      });

      expect(screen.getByText('Failed to load revisions')).toBeDefined();
      const retryBtn = screen.getByText('Retry Loading Revisions');
      expect(retryBtn).toBeDefined();

      // Retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRevisionsList
      });

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(screen.getByText('Revision #1')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // UI-ACT-07: Requester revision isolation
  // --------------------------------------------------------------------------
  describe('UI-ACT-07: Requester revision isolation', () => {
    it('ensures Requester has no access to View History buttons and cannot open revision modal', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActionsList
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // View History button is absent
      expect(screen.queryByLabelText('View Action Taken Revision History')).toBeNull();
      expect(screen.queryByText('View History')).toBeNull();

      // Modal is not in DOM
      expect(screen.queryByText(/Revision History - Action Taken/)).toBeNull();

      // Normal timeline still renders
      expect(screen.getByText('Checked router cables and swapped port')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Modal Accessibility: Escape key and focus trap
  // --------------------------------------------------------------------------
  describe('Modal Accessibility: Escape key and focus trap', () => {
    function createDeferred<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it('prevents Escape dismissal while Create form submission is in-flight and preserves form state and key', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // 1. Open Create Modal
      fireEvent.click(screen.getByText('+ Add Action Taken'));
      expect(screen.getByText('Log Action Taken')).toBeDefined();

      // 2. Fill required fields
      const descInput = screen.getByPlaceholderText('Describe the technical action performed...');
      const resultInput = screen.getByPlaceholderText('Describe the observed result or outcome...');
      fireEvent.change(descInput, { target: { value: 'In-flight Escape action test' } });
      fireEvent.change(resultInput, { target: { value: 'In-flight Escape result test' } });

      // 3. Submit form with pending Promise
      const deferredPost = createDeferred<any>();
      mockFetch.mockReturnValueOnce(deferredPost.promise);

      await act(async () => {
        fireEvent.click(screen.getByText('Save Action Taken'));
      });

      // 4. Verify isSubmitting behavior through spinner & disabled button
      expect(screen.getByText('Saving Action Taken...')).toBeDefined();
      const submitBtn = screen.getByRole('button', { name: /saving action taken/i });
      expect(submitBtn.hasAttribute('disabled')).toBe(true);

      const postCallsBeforeEscape = mockFetch.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(postCallsBeforeEscape.length).toBe(1);
      const originalKey = postCallsBeforeEscape[0][1].headers['Idempotency-Key'];
      expect(originalKey).toBeDefined();

      // 5. Press Escape while POST request is still pending
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      });

      // 6. Assertions while in-flight:
      // - Create modal remains visible
      expect(screen.getByText('Log Action Taken')).toBeDefined();
      // - Form values are preserved
      expect((descInput as HTMLTextAreaElement).value).toBe('In-flight Escape action test');
      expect((resultInput as HTMLTextAreaElement).value).toBe('In-flight Escape result test');
      // - No additional POST request was triggered
      const postCallsAfterEscape = mockFetch.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(postCallsAfterEscape.length).toBe(1);
      // - Original Idempotency-Key has not been replaced or regenerated
      expect(postCallsAfterEscape[0][1].headers['Idempotency-Key']).toBe(originalKey);

      // 7. Resolve the pending request successfully
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        deferredPost.resolve({
          ok: true,
          json: async () => ({ id: 50, actionDescription: 'In-flight Escape action test' })
        });
      });

      // 8. Verify existing successful-submission flow closes modal normally
      await waitFor(() => {
        expect(screen.queryByText('Log Action Taken')).toBeNull();
      });
    });

    it('prevents Escape dismissal while Edit form submission is in-flight and preserves draft values', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      // 1. Open Edit Modal
      fireEvent.click(screen.getByLabelText('Edit Action Taken'));
      expect(screen.getByText('Edit Action Taken')).toBeDefined();

      // 2. Modify at least one editable field
      const descInput = screen.getByPlaceholderText('Describe the technical action performed...');
      fireEvent.change(descInput, { target: { value: 'Modified while pending escape test' } });

      // 3. Submit form with pending Promise
      const deferredPatch = createDeferred<any>();
      mockFetch.mockReturnValueOnce(deferredPatch.promise);

      await act(async () => {
        fireEvent.click(screen.getByText('Save Changes'));
      });

      // Verify submitting state
      expect(screen.getByText('Saving Changes...')).toBeDefined();

      const patchCallsBeforeEscape = mockFetch.mock.calls.filter(c => c[1]?.method === 'PATCH');
      expect(patchCallsBeforeEscape.length).toBe(1);

      // 4. Press Escape while PATCH request is still pending
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      });

      // 5. Assertions while in-flight:
      // - Edit modal remains visible
      expect(screen.getByText('Edit Action Taken')).toBeDefined();
      // - Edited draft values are preserved
      expect((descInput as HTMLTextAreaElement).value).toBe('Modified while pending escape test');
      // - Original performer remains unchanged
      expect(screen.getByText(/Originally recorded by: Alice Staff \(IT Staff\)/)).toBeDefined();
      // - No additional PATCH request was triggered
      const patchCallsAfterEscape = mockFetch.mock.calls.filter(c => c[1]?.method === 'PATCH');
      expect(patchCallsAfterEscape.length).toBe(1);

      // 6. Resolve pending PATCH request successfully
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        deferredPatch.resolve({
          ok: true,
          json: async () => ({ ...mockActionsList[0], actionDescription: 'Modified while pending escape test' })
        });
      });

      // 7. Verify existing successful-submission flow closes modal normally
      await waitFor(() => {
        expect(screen.queryByText('Edit Action Taken')).toBeNull();
      });
    });

    it('closes create modal on Escape key press when not submitting', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      fireEvent.click(screen.getByText('+ Add Action Taken'));
      expect(screen.getByText('Log Action Taken')).toBeDefined();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByText('Log Action Taken')).toBeNull();
    });

    it('closes edit modal on Escape key press when not submitting', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      fireEvent.click(screen.getByLabelText('Edit Action Taken'));
      expect(screen.getByText('Edit Action Taken')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByText('Edit Action Taken')).toBeNull();
    });

    it('closes revision history modal on Escape key press', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockActionsList[0]]
      });

      await act(async () => {
        render(<ActionsTaken ticketId={1} />);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('View Action Taken Revision History'));
      });

      expect(screen.getByText('Revision History - Action Taken #10')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByText('Revision History - Action Taken #10')).toBeNull();
    });
  });
});
