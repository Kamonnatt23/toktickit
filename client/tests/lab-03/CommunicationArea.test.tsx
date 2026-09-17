import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommunicationArea } from '../../src/components/CommunicationArea';
import * as AuthContextModule from '../../src/contexts/AuthContext';

describe('CommunicationArea Component', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('comments')) {
        return { ok: true, json: async () => [{ id: 1, content: 'Public comment', createdAt: new Date().toISOString(), author: { id: 1, name: 'Req', role: 'Requester' } }] };
      }
      if (url.includes('notes')) {
        return { ok: true, json: async () => [{ id: 2, content: 'Secret note', createdAt: new Date().toISOString(), author: { id: 2, name: 'Staff', role: 'IT Staff' } }] };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it('renders comments and allows posting for Requester', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 1, role: 'Requester' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
    
    await act(async () => {
      render(<CommunicationArea ticketId={1} ticketStatus="New" onUpdate={vi.fn()} />);
    });

    // Should see public comment
    expect(screen.getByText('Public comment')).toBeDefined();
    // Should NOT see internal note (requester doesn't fetch them)
    expect(screen.queryByText('Secret note')).toBeNull();

    // Check textarea exists
    const textarea = screen.getByPlaceholderText('Type your message here...');
    expect(textarea).toBeDefined();

    // No internal note toggle for requester
    expect(screen.queryByText('Post as Internal Note')).toBeNull();
  });

  it('renders comments and notes and internal toggle for IT Staff', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 2, role: 'IT Staff' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
    
    await act(async () => {
      render(<CommunicationArea ticketId={1} ticketStatus="New" onUpdate={vi.fn()} />);
    });

    expect(screen.getByText('Public comment')).toBeDefined();
    expect(screen.getByText('Secret note')).toBeDefined();
    
    const textarea = screen.getByPlaceholderText('Type your message here...');
    expect(textarea).toBeDefined();

    expect(screen.getByLabelText('Post as Internal Note')).toBeDefined();
  });

  it('renders read-only for Administrator', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 3, role: 'Administrator' }, isLoading: false, login: vi.fn(), logout: vi.fn() });
    
    await act(async () => {
      render(<CommunicationArea ticketId={1} ticketStatus="New" onUpdate={vi.fn()} />);
    });

    expect(screen.getByText('Public comment')).toBeDefined();
    expect(screen.getByText('Secret note')).toBeDefined();
    
    // No textarea
    expect(screen.queryByPlaceholderText('Type your message here...')).toBeNull();
  });
});
