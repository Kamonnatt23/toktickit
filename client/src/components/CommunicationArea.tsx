import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../api';

interface CommunicationAreaProps {
  ticketId: number;
  ticketStatus: string;
  onUpdate: () => void;
}

interface Comment {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; name: string; role: string };
  isInternal?: boolean;
}

export function CommunicationArea({ ticketId, ticketStatus, onUpdate }: CommunicationAreaProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Comment[]>([]);
  const [newContent, setNewContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMessages = async () => {
    try {
      const [commentsRes, notesRes] = await Promise.all([
        fetch(`${API_URL}/api/tickets/${ticketId}/comments`, { credentials: 'include' }),
        user?.role !== 'Requester' ? fetch(`${API_URL}/api/tickets/${ticketId}/notes`, { credentials: 'include' }) : Promise.resolve(null)
      ]);

      let allMessages: Comment[] = [];

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        allMessages = Array.isArray(commentsData) ? [...commentsData] : [];
      }

      if (notesRes && notesRes.ok) {
        const notesData = await notesRes.json();
        const mappedNotes = Array.isArray(notesData) ? notesData.map((n: any) => ({ ...n, isInternal: true })) : [];
        allMessages = [...allMessages, ...mappedNotes];
      }

      // Sort by creation time
      allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(allMessages);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [ticketId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setLoading(true);
    setError('');
    try {
      const endpoint = isInternal ? 'notes' : 'comments';
      const res = await fetch(`${API_URL}/api/tickets/${ticketId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newContent })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post message');

      setNewContent('');
      await fetchMessages();
      onUpdate(); // Triggers parent ticket refresh in case status changed
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppearsResolved = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/tickets/${ticketId}/appears-resolved`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark as resolved');

      await fetchMessages();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded bg-white shadow-sm">
      <h5 className="fw-bold mb-4">Communication History</h5>
      
      <div className="mb-4 d-flex flex-column gap-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div className="text-muted text-center py-3">No comments or notes yet.</div>
        ) : (
          messages.map(msg => (
            <div key={`${msg.isInternal ? 'note' : 'comment'}-${msg.id}`} className={`p-3 rounded border ${msg.isInternal ? 'bg-warning bg-opacity-10 border-warning' : 'bg-light'}`}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-bold">
                  {msg.author.name} {msg.author.role === 'IT Staff' ? <span className="badge bg-primary ms-1">Staff</span> : ''}
                  {msg.isInternal && <span className="badge bg-warning text-dark ms-2">Internal Note</span>}
                </div>
                <div className="text-muted small">
                  {new Date(msg.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>

      {user?.role !== 'Administrator' && (
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          
          <div className="mb-3">
            <textarea 
              className="form-control" 
              rows={3} 
              placeholder="Type your message here..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={2000}
              disabled={loading}
              required
            ></textarea>
            <div className="text-end text-muted small mt-1">{newContent.length}/2000</div>
          </div>
          
          <div className="d-flex justify-content-between align-items-center">
            <div>
              {user?.role === 'IT Staff' && (
                <div className="form-check form-switch">
                  <input 
                    className="form-check-input" 
                    type="checkbox" 
                    id="internalNoteSwitch"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    disabled={loading}
                  />
                  <label className="form-check-label fw-bold text-warning" htmlFor="internalNoteSwitch">
                    Post as Internal Note
                  </label>
                </div>
              )}
            </div>
            
            <div className="d-flex gap-2">
              {user?.role === 'Requester' && ticketStatus === 'In Progress' && (
                <button type="button" className="btn btn-outline-success" onClick={handleAppearsResolved} disabled={loading}>
                  Problem Appears Resolved
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading || !newContent.trim()}>
                Post Message
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
