import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MyTickets } from '../../src/components/MyTickets.js';
import { DevProvider } from '../../src/contexts/DevContext.js';

const mockUser = { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Requester' };
const mockTickets = [
  { id: 1, ticketNumber: 'TKT-001', summary: 'Broken Mouse', status: 'New', priority: 'Low', createdAt: '2023-01-01T00:00:00.000Z', category: { name: 'Hardware' }, relatedSystem: { name: 'ERP' } },
  { id: 2, ticketNumber: 'TKT-002', summary: 'Lost Password', status: 'In Progress', priority: 'Critical', createdAt: '2023-01-02T00:00:00.000Z', category: { name: 'Software' }, relatedSystem: { name: 'Email' } }
];

describe('MyTickets', () => {
  beforeEach(() => {
    localStorage.setItem('dev_requester_user', JSON.stringify(mockUser));
    
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/tickets')) {
        if (url.includes('search=Lost')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [mockTickets[1]], pagination: { total: 1, totalPages: 1 } }) });
        }
        if (url.includes('status=Closed')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], pagination: { total: 0, totalPages: 1 } }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockTickets, pagination: { total: 2, totalPages: 1 } }) });
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;
  });

  it('renders tickets list', async () => {
    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('TKT-001')).toBeInTheDocument();
      expect(screen.getByText('Broken Mouse')).toBeInTheDocument();
      expect(screen.getByText('TKT-002')).toBeInTheDocument();
      expect(screen.getByText('Lost Password')).toBeInTheDocument();
    });
  });

  it('shows empty state when no tickets', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], pagination: { total: 0, totalPages: 1 } }) });
    }) as any;
    
    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('No tickets found!')).toBeInTheDocument();
    });
  });

  it('searches for tickets', async () => {
    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Broken Mouse')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Search by Ticket # or Summary');
    fireEvent.change(searchInput, { target: { value: 'Lost' } });
    
    await waitFor(() => {
      expect(screen.queryByText('Broken Mouse')).not.toBeInTheDocument();
      expect(screen.getByText('Lost Password')).toBeInTheDocument();
    });
  });
  
  it('filters by status and sorts', async () => {
    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Broken Mouse')).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusSelect, { target: { value: 'Closed' } });

    await waitFor(() => {
      expect(screen.getByText('No tickets found!')).toBeInTheDocument();
    });
    
    // Test sorting toggle
    const sortBtn = screen.getByText('Desc ↓');
    fireEvent.click(sortBtn);
    
    await waitFor(() => {
      expect(screen.getByText('Asc ↑')).toBeInTheDocument();
    });
  });
  
  it('handles pagination', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/tickets')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockTickets, pagination: { total: 10, totalPages: 2 } }) });
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;

    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
    
    const nextBtn = screen.getByText('Next');
    fireEvent.click(nextBtn);
    
    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });
    
    const prevBtn = screen.getByText('Previous');
    fireEvent.click(prevBtn);
    
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });
  
  it('shows error state on API failure', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/tickets')) {
        return Promise.reject(new Error('Failed to fetch tickets'));
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;
    
    render(<DevProvider><MyTickets /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch tickets')).toBeInTheDocument();
    });
  });
});
