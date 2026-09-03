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

const mockTicketWithAttachments = { 
  ...mockTicket,
  attachments: [
    { id: 101, fileName: 'screenshot.png', fileSize: 50000, isDeleted: false }
  ]
};

describe('TicketDetail', () => {
  beforeEach(() => {
    localStorage.setItem('dev_requester_user', JSON.stringify(mockUser));
    
    global.fetch = vi.fn((url: string, options: any) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/tickets/1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTicket) });
      }
      if (url.includes('/api/tickets/2')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTicketWithAttachments) });
      }
      if (url.includes('/api/tickets/99')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Ticket not found' }) });
      }
      if (url.includes('/api/attachments') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 102, fileName: 'new.png', fileSize: 100 }) });
      }
      if (url.includes('/api/attachments/101') && options?.method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/attachments/101/download')) {
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['foo'])) });
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;
    
    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
    
    // Mock prompt
    global.prompt = vi.fn(() => 'no longer needed');
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      expect(screen.getByText('No attachments found.')).toBeInTheDocument();
    });
  });

  it('renders attachments list', async () => {
    render(<DevProvider><TicketDetail ticketId={2} onBack={vi.fn()} /></DevProvider>);
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    });
  });

  it('handles attachment upload', async () => {
    render(<DevProvider><TicketDetail ticketId={1} onBack={vi.fn()} /></DevProvider>);
    await waitFor(() => {
      expect(screen.getByText('My Issue')).toBeInTheDocument();
    });
    
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/attachments'), expect.objectContaining({ method: 'POST' }));
    });
  });

  it('handles attachment download', async () => {
    render(<DevProvider><TicketDetail ticketId={2} onBack={vi.fn()} /></DevProvider>);
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    });
    
    const dlBtn = screen.getByText('Download');
    fireEvent.click(dlBtn);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/attachments/101/download'), expect.anything());
    });
  });

  it('handles attachment removal', async () => {
    render(<DevProvider><TicketDetail ticketId={2} onBack={vi.fn()} /></DevProvider>);
    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    });
    
    const rmBtn = screen.getByText('Remove');
    fireEvent.click(rmBtn);
    
    await waitFor(() => {
      expect(global.prompt).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/attachments/101'), expect.objectContaining({ method: 'DELETE' }));
    });
  });

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn();
    render(<DevProvider><TicketDetail ticketId={1} onBack={onBack} /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('My Issue')).toBeInTheDocument();
    });
    
    const backBtn = screen.getByText(/Back to My Tickets/i);
    fireEvent.click(backBtn);
    
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows error state when ticket is not found', async () => {
    const onBack = vi.fn();
    render(<DevProvider><TicketDetail ticketId={99} onBack={onBack} /></DevProvider>);
    
    await waitFor(() => {
      expect(screen.getByText('Ticket not found')).toBeInTheDocument();
    });
    
    const backBtn = screen.getByText(/Back to My Tickets/i);
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
