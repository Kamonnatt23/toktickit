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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
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
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
      return { ok: true, json: async () => defaultData };
    });

    fireEvent.click(nextButton);

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('page=2'));
      expect(call).toBeTruthy();
    });
  });

  it('handles assigned to filter interaction', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
      return { ok: true, json: async () => defaultData };
    });

    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    
    // We should see 'All Assignees'
    const assigneeSelect = (await screen.findAllByRole('combobox')).find((el: any) => el.innerHTML.includes('All Assignees'));
    expect(assigneeSelect).toBeInTheDocument();
    
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
      return { ok: true, json: async () => defaultData };
    });

    // Select 'Another Staff' (id 3)
    fireEvent.change(assigneeSelect!, { target: { value: '3' } });
    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('ownerId=3'));
      expect(call).toBeTruthy();
    });

    // Select 'Unassigned'
    fireEvent.change(assigneeSelect!, { target: { value: 'Unassigned' } });
    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('ownerId=Unassigned'));
      expect(call).toBeTruthy();
    });

    // Select 'Assigned to Me' (id 2)
    fireEvent.change(assigneeSelect!, { target: { value: '2' } });
    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('ownerId=2'));
      expect(call).toBeTruthy();
    });
  });


  it('allows Administrator to trigger ticket detail navigation', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [] }) };
      return { ok: true, json: async () => defaultData }; // Returns 3 tickets
    });

    const onTicketClick = vi.fn();
    (useAuth as any).mockReturnValue({ user: { id: 4, role: 'Administrator', name: 'Admin' }, isLoading: false });
    
    render(<StaffQueue onTicketClick={onTicketClick} />);

    // Wait for the rows to render
    const rows = await screen.findAllByRole('row');
    const dataRow = rows[1]; // First row is header
    
    fireEvent.click(dataRow);
    expect(onTicketClick).toHaveBeenCalledWith(1);
  });

  it('hides Assigned to Me for Administrator', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }] }) };
      return { ok: true, json: async () => defaultData };
    });

    renderWithContext({ id: 4, role: 'Administrator', name: 'Admin' });
    
    // Wait for the combobox to render
    const assigneeSelect = (await screen.findAllByRole('combobox')).find((el: any) => el.innerHTML.includes('All Assignees'));
    expect(assigneeSelect).toBeInTheDocument();
    
    // Administrator should NOT see 'Assigned to Me'
    expect(screen.queryByRole('option', { name: 'Assigned to Me' })).not.toBeInTheDocument();
  });

  it('handles page number interaction', async () => {
    // Modify defaultData temporarily to have 5 pages
    const multiPageData = {
      ...defaultData,
      pagination: { total: 50, page: 1, limit: 10, totalPages: 5 }
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      if (url.includes('staff/users')) return { ok: true, json: async () => ({ data: [{ id: 2, name: 'Staff', role: 'IT Staff' }, { id: 3, name: 'Another Staff', role: 'IT Staff' }] }) };
      return { ok: true, json: async () => multiPageData };
    });

    renderWithContext({ id: 2, role: 'IT Staff', name: 'Staff' });
    
    // Wait for page numbers to render
    const page3Btn = await screen.findByText('3');
    expect(page3Btn).toBeInTheDocument();
    
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('categories')) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => multiPageData };
    });

    fireEvent.click(page3Btn);

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c: any) => c[0].includes('page=3'));
      expect(call).toBeTruthy();
    });
  });
});
