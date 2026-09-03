import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DevProvider, useDevContext } from '../../src/contexts/DevContext.js';
import { DevRequesterSelection } from '../../src/components/DevRequesterSelection.js';

// Mock fetch
const mockUsers = [
  { id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'Requester' },
  { id: 2, name: 'Bob Jones', email: 'bob@example.com', role: 'Requester' }
];

describe('DevContext & Requester Selection (T-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUsers),
      })
    ) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders selection screen when no active user', async () => {
    render(
      <DevProvider>
        <DevRequesterSelection />
      </DevProvider>
    );

    // Should show loading then the select dropdown
    expect(screen.getByText(/Select Development Context/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Check options
    expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument();
  });

  it('allows selecting a user and saves to localStorage', async () => {
    render(
      <DevProvider>
        <DevRequesterSelection />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    
    const continueBtn = screen.getByText(/Continue as User/i);
    fireEvent.click(continueBtn);

    // Should change to the testing mode banner
    await waitFor(() => {
      expect(screen.getByText(/\[TESTING MODE\]/i)).toBeInTheDocument();
      expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument();
    });

    const saved = localStorage.getItem('dev_requester_user');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!).id).toBe(1);
  });

  it('allows changing requester', async () => {
    localStorage.setItem('dev_requester_user', JSON.stringify(mockUsers[1]));
    
    render(
      <DevProvider>
        <DevRequesterSelection />
      </DevProvider>
    );

    // Should start in banner mode
    expect(screen.getByText(/Bob Jones/i)).toBeInTheDocument();
    
    // Click change
    const changeBtn = screen.getByText(/Change Requester/i);
    fireEvent.click(changeBtn);

    // Should go back to selection screen
    expect(screen.queryByText(/\[TESTING MODE\]/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Select Development Context/i)).toBeInTheDocument();
    
    expect(localStorage.getItem('dev_requester_user')).toBeNull();
  });
});
