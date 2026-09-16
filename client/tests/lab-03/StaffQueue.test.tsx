import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StaffQueue } from '../../src/components/StaffQueue';

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}));

import { useAuth } from '../../src/contexts/AuthContext';

const renderWithContext = (user: any) => {
  (useAuth as any).mockReturnValue({ user, isLoading: false, login: vi.fn(), logout: vi.fn(), checkSession: vi.fn() });
  return render(<StaffQueue onTicketClick={vi.fn()} />);
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultData = {
  data: [
    {
      id: 1, ticketNumber: 'TKT-001', summary: 'Broken keyboard',
      status: 'New', priority: 'High', itPriority: 'High',
      createdAt: new Date().toISOString(),
      category: { id: 1, name: 'Hardware' }, relatedSystem: { id: 1, name: 'Desktop' },
      requester: { id: 9, name: 'Bob', email: 'bob@example.com' }, owner: null
    }
  ],
  pagination: { total: 20, page: 1, limit: 10, totalPages: 2 }
};

describe('StaffQueue Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => defaultData };
    });
  });

  it('denies access to Requester', () => {
    renderWithContext({ id: 1, role: 'Requester', name: 'Req' });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders loading state initially and uses credentials', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); 
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Check that fetch was called with credentials: 'include'
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('renders empty state when no tickets', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => ({ data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } }) };
    });
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    await waitFor(() => {
      expect(screen.getByText('No tickets found matching your criteria')).toBeInTheDocument();
    });
  });

  it('renders error state on fetch failure', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      throw new Error('Network error');
    });
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('renders table with tickets', async () => {
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    
    const elements = await screen.findAllByText('TKT-001');
    expect(elements.length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Broken keyboard')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Bob')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Unassigned')).length).toBeGreaterThan(0);
  });

  it('handles search interaction', async () => {
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    const searchInput = await screen.findByPlaceholderText('Search ID or summary...');
    
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => defaultData };
    });

    fireEvent.change(searchInput, { target: { value: 'keyboard' } });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('search=keyboard'));
      expect(call).toBeTruthy();
    });
  });

  it('handles sorting interaction', async () => {
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    
    const createdHeaders = await screen.findAllByText(/Created/);
    expect(createdHeaders.length).toBeGreaterThan(0);
    
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => defaultData };
    });

    fireEvent.click(createdHeaders[0]); 

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('sortOrder=asc'));
      expect(call).toBeTruthy();
    });
  });

  it('handles pagination interaction', async () => {
    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    
    const nextButton = await screen.findByText('Next');
    expect(nextButton).not.toBeDisabled();
    
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => defaultData };
    });

    fireEvent.click(nextButton);

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('page=2'));
      expect(call).toBeTruthy();
    });
  });
});
