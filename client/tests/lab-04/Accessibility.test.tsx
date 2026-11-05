import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ActionsTaken, CreateActionModal, EditActionModal, RevisionHistoryModal } from '../../src/components/ActionsTaken';
import { CreateTicket } from '../../src/components/CreateTicket';
import { StaffDashboard } from '../../src/components/StaffDashboard';
import { RequesterDashboard } from '../../src/components/RequesterDashboard';
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

const mockAction = {
  id: 1,
  ticketId: 10,
  performedById: 2,
  performedBy: mockStaffUser,
  actionDateTime: '2026-11-05T08:00:00.000Z',
  actionDescription: 'Original description of the work performed',
  result: 'Original result of the work',
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z'
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Accessibility Tests (UI-ACC-01 & UI-ACC-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // UI-ACC-01: Modal Keyboard Accessibility
  // ==========================================================================
  describe('UI-ACC-01: Modal Keyboard Focus, Trap, and Escape Handling', () => {
    it('traps focus inside the modal on Tab and Shift+Tab navigation', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <CreateActionModal
          ticketId={10}
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      );

      // Verify modal is open
      expect(screen.getByText('Log Action Taken')).toBeDefined();

      // Find all focusable elements inside the modal
      const modal = screen.getByRole('dialog', { hidden: true });
      const focusables = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      expect(focusables.length).toBeGreaterThan(1);

      const firstElement = focusables[0];
      const lastElement = focusables[focusables.length - 1];

      // Focus first element, press Shift+Tab -> should wrap to last element
      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastElement);

      // Focus last element, press Tab -> should wrap to first element
      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(firstElement);
    });

    it('dismisses modal on Escape key press when not submitting', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <CreateActionModal
          ticketId={10}
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      );

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('prevents Escape key dismissal while form submission is in progress', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      let resolveFetch!: (val: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      mockFetch.mockReturnValueOnce(pendingPromise);

      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <CreateActionModal
          ticketId={10}
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      );

      // Fill in valid data
      const descInput = screen.getByPlaceholderText('Describe the technical action performed...');
      const resultInput = screen.getByPlaceholderText('Describe the observed result or outcome...');
      fireEvent.change(descInput, { target: { value: 'Fixing network switch port' } });
      fireEvent.change(resultInput, { target: { value: 'Port reactivated successfully' } });

      // Click submit
      const submitBtn = screen.getByText('Save Action Taken');
      fireEvent.click(submitBtn);

      // While submitting, submit button shows spinner and is disabled
      await waitFor(() => {
        expect(screen.getByText('Saving Action Taken...')).toBeDefined();
      });

      // Press Escape during in-flight submission
      fireEvent.keyDown(document, { key: 'Escape' });

      // Modal must NOT dismiss
      expect(handleClose).not.toHaveBeenCalled();

      // Resolve in-flight request
      await act(async () => {
        resolveFetch({
          ok: true,
          status: 201,
          json: async () => ({ ...mockAction, id: 101 })
        });
      });

      await waitFor(() => {
        expect(handleSuccess).toHaveBeenCalled();
      });
    });

    it('focus trap in RevisionHistoryModal closes cleanly on Escape', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
      });

      const handleClose = vi.fn();

      render(
        <RevisionHistoryModal
          ticketId={10}
          actionId={1}
          isOpen={true}
          onClose={handleClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Revision History - Action Taken #1/i)).toBeDefined();
      });

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // UI-ACC-02: Accessible Controls, Labels, Errors, and Live Regions
  // ==========================================================================
  describe('UI-ACC-02: Accessible Labels, Form Field Associations, and Live Regions', () => {
    it('verifies icon-only controls have accessible labels (aria-label)', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [mockAction]
      });

      render(<ActionsTaken ticketId={10} />);

      await waitFor(() => {
        expect(screen.getByText('Original description of the work performed')).toBeDefined();
      });

      // Edit Action Taken button has aria-label
      const editBtn = screen.getByLabelText('Edit Action Taken');
      expect(editBtn).toBeDefined();

      // View History button has aria-label
      const historyBtn = screen.getByLabelText('View Action Taken Revision History');
      expect(historyBtn).toBeDefined();
    });

    it('verifies form labels are explicitly associated with their input controls', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/api/categories')) {
          return { ok: true, json: async () => [{ id: 1, name: 'Network' }] };
        }
        if (url.includes('/api/related-systems')) {
          return { ok: true, json: async () => [{ id: 1, name: 'VPN' }] };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<CreateTicket />);

      await waitFor(() => {
        expect(screen.getByText('Create New Ticket')).toBeDefined();
      });

      // Verify label htmlFor binds to input id
      const categoryLabel = screen.getByText((content, element) => element?.tagName.toLowerCase() === 'label' && content.includes('Category'));
      expect(categoryLabel.getAttribute('for')).toBe('categoryId');
      const categorySelect = document.getElementById('categoryId');
      expect(categorySelect).not.toBeNull();

      const summaryLabel = screen.getByText((content, element) => element?.tagName.toLowerCase() === 'label' && content.includes('Summary'));
      expect(summaryLabel.getAttribute('for')).toBe('summary');
      const summaryInput = document.getElementById('summary');
      expect(summaryInput).not.toBeNull();

      const priorityLabel = screen.getByText((content, element) => element?.tagName.toLowerCase() === 'label' && content.includes('Priority'));
      expect(priorityLabel.getAttribute('for')).toBe('priority');
      const prioritySelect = document.getElementById('priority');
      expect(prioritySelect).not.toBeNull();
    });

    it('verifies form validation errors mark fields as invalid and show messages', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockRequesterUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/api/categories')) {
          return { ok: true, json: async () => [{ id: 1, name: 'Hardware' }] };
        }
        if (url.includes('/api/related-systems')) {
          return { ok: true, json: async () => [{ id: 1, name: 'Workstation' }] };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<CreateTicket />);

      await waitFor(() => {
        expect(screen.getByText('Create New Ticket')).toBeDefined();
      });

      // Submit empty form to trigger validation
      const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Summary is required')).toBeDefined();
      });

      const summaryInput = document.getElementById('summary');
      expect(summaryInput?.className).toContain('is-invalid');
    });

    it('verifies loading and error states expose live regions (role="status", aria-live="polite")', async () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: mockStaffUser,
        isLoading: false,
        setUser: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn()
      });

      // Mock error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' })
      });

      const { container } = render(<StaffDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to load dashboard data/i)).toBeDefined();
      });

      // Verify error container has role="status" and aria-live="polite"
      const liveRegion = container.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
    });
  });
});
