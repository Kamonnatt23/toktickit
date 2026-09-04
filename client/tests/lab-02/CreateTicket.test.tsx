import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateTicket } from '../../src/components/CreateTicket.js';
import { DevProvider } from '../../src/contexts/DevContext.js';

// Mock contexts and fetch
const mockCategories = [{ id: 1, name: 'Hardware' }];
const mockSystems = [{ id: 1, name: 'ERP' }];
const mockUser = { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Requester' };

describe('CreateTicket Form', () => {
  beforeEach(() => {
    localStorage.setItem('dev_requester_user', JSON.stringify(mockUser));
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/dev/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockUser]) });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) });
      }
      if (url.includes('/api/related-systems')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSystems) });
      }
      if (url.includes('/api/tickets')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 1, ticketNumber: 'TKT-001' }) });
      }
      return Promise.reject(new Error('Not Found'));
    }) as any;
  });

  it('renders form fields correctly', async () => {
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Related System/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Summary/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Ticket/i })).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Category is required')).toBeInTheDocument();
      expect(screen.getByText('Related System is required')).toBeInTheDocument();
      expect(screen.getByText('Summary is required')).toBeInTheDocument();
      expect(screen.getByText('Description is required')).toBeInTheDocument();
    });
  });

  it('successfully submits the form and shows Ticket Number', async () => {
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Related System/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'My issue' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'It is broken' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Ticket TKT-001 created successfully!')).toBeInTheDocument();
    });
  });

  it('successfully submits the form with exact boundary lengths', async () => {
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Related System/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'A'.repeat(100) } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'B'.repeat(1000) } });

    const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Ticket TKT-001 created successfully!')).toBeInTheDocument();
    });
  });

  it('shows validation errors when exceeding max length', async () => {
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Ticket')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Related System/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: 'A'.repeat(101) } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'B'.repeat(1001) } });

    const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Summary must be 100 characters or less')).toBeInTheDocument();
      expect(screen.getByText('Description must be 1000 characters or less')).toBeInTheDocument();
    });
  });

  it('shows error when dropdowns fail to load', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network Error'))) as any;
    render(
      <DevProvider>
        <CreateTicket />
      </DevProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Network Error')).toBeInTheDocument();
    });
  });
});
