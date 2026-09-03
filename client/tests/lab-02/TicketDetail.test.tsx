import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TicketDetail } from '../../src/components/TicketDetail.js';
import { DevProvider } from '../../src/contexts/DevContext.js';

const mockUser = { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Requester' };
const mockTicket = { 
  id: 1, 
  ticketNumber: 'TKT-001', 
  summary: 'My Issue', 
  description: 'This is the issue details.', 
  status: 'New', 
  priority: 'High', 
  createdAt: '2023-01-01T10:00:00.000Z',
  updatedAt: '2023-01-01T10:00:00.000Z', 
  category: { name: 'Hardware' }, 
  relatedSystem: { name: 'ERP' } 
};

describe('TicketDetail', () => {
  beforeEach(() => {
    localStorage.setItem('dev_requester_user', JSON.stringify(mockUser));
    
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/tickets/1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTicket) });
      }
      if (url.includes('/api/tickets/99')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Ticket not found' }) });
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;
  });

  it('renders ticket details successfully', async () => {
    const onBack = vi.fn();
    render(<DevProvider><TicketDetail ticketId={1} onBack={onBack} /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('My Issue')).toBeInTheDocument();
      expect(screen.getByText('This is the issue details.')).toBeInTheDocument();
      expect(screen.getByText('Hardware')).toBeInTheDocument();
      expect(screen.getByText('ERP')).toBeInTheDocument();
      expect(screen.getByText('TKT-001')).toBeInTheDocument();
    });
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(<DevProvider><TicketDetail ticketId={1} onBack={onBack} /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('My Issue')).toBeInTheDocument();
    });
    
    const backBtn = screen.getByText('← Back to My Tickets');
    fireEvent.click(backBtn);
    
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows error state when ticket is not found', async () => {
    const onBack = vi.fn();
    render(<DevProvider><TicketDetail ticketId={99} onBack={onBack} /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Ticket not found')).toBeInTheDocument();
    });
    
    const backBtn = screen.getByText('Back to My Tickets');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
