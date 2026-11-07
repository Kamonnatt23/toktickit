import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../api';

export interface Performer {
  id: number;
  name: string;
  email?: string;
  role: string;
}

export interface ActionTaken {
  id: number;
  ticketId: number;
  performedById: number;
  performedBy: Performer;
  actionDateTime: string;
  actionDescription: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionSnapshot {
  actionDateTime: string;
  actionDescription: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

export interface ActionTakenRevision {
  id: number;
  actionTakenId: number;
  editedById: number;
  editedBy: Performer;
  editedAt: string;
  beforeSnapshot: ActionSnapshot;
  afterSnapshot: ActionSnapshot;
}

interface ActionsTakenProps {
  ticketId: number;
  onTicketUpdated?: () => void;
  onActionsLoaded?: (count: number) => void;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function toDatetimeLocal(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function isFutureDate(localStr: string): boolean {
  if (!localStr) return false;
  const d = new Date(localStr);
  return d.getTime() > Date.now();
}

export function formatDisplayDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function useModalAccessibility(
  isOpen: boolean,
  onClose: () => void,
  modalRef: React.RefObject<HTMLDivElement>,
  isSubmitting: boolean = false
) {
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (isSubmittingRef.current) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          onCloseRef.current();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      const timer = setTimeout(() => {
        if (modalRef.current) {
          const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            modalRef.current.focus();
          }
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose, modalRef]);
}

interface CreateActionModalProps {
  ticketId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateActionModal({ ticketId, isOpen, onClose, onSuccess }: CreateActionModalProps) {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);

  // Single Idempotency-Key generated on form mount; preserved across network retries
  const [idempotencyKey] = useState<string>(() => generateUUID());
  const [actionDateTime, setActionDateTime] = useState<string>(() => toDatetimeLocal(new Date()));
  const [actionDescription, setActionDescription] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [followUpRequired, setFollowUpRequired] = useState<boolean>(false);
  const [followUpNote, setFollowUpNote] = useState<string>('');
  const [attachmentNotes, setAttachmentNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useModalAccessibility(isOpen, onClose, modalRef, isSubmitting);

  if (!isOpen) return null;

  const isFuture = isFutureDate(actionDateTime);
  const isDescriptionValid = actionDescription.trim().length > 0 && actionDescription.trim().length <= 2000;
  const isResultValid = result.trim().length > 0 && result.trim().length <= 2000;
  const isFollowUpValid = !followUpRequired || (followUpNote.trim().length > 0 && followUpNote.trim().length <= 2000);
  const isAttachmentNotesValid = attachmentNotes.trim().length <= 500;
  const isFormValid = !isFuture && isDescriptionValid && isResultValid && isFollowUpValid && isAttachmentNotesValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      const payload = {
        actionDateTime: new Date(actionDateTime).toISOString(),
        actionDescription: actionDescription.trim(),
        result: result.trim(),
        followUpRequired,
        followUpNote: followUpRequired ? followUpNote.trim() : null,
        attachmentNotes: attachmentNotes.trim() ? attachmentNotes.trim() : null
      };

      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to save action taken. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred. Your inputs and request key have been preserved. You may retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-action-modal-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" ref={modalRef}>
        <div className="modal-content shadow border-0" style={{ borderRadius: '15px' }}>
          <div className="modal-header border-0 pb-0" style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
            <h5 className="modal-title fw-bold" id="create-action-modal-title" style={{ color: '#006B3C' }}>
              Log Action Taken
            </h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              disabled={isSubmitting}
              onClick={onClose}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {error && (
                <div className="alert alert-danger py-2 small mb-3" role="alert">
                  {error}
                </div>
              )}

              {/* Performer Read-Only display */}
              <div className="mb-3 p-3 bg-light rounded border">
                <small className="text-muted d-block fw-bold text-uppercase">Recorded By</small>
                <div className="fw-semibold text-dark">
                  Will be recorded as: {user?.name || 'Current User'} ({user?.role || 'IT Staff'})
                </div>
              </div>

              {/* Action Date / Time */}
              <div className="mb-3">
                <label htmlFor="create-actionDateTime" className="form-label small fw-bold">
                  Action Date & Time <span className="text-danger">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="create-actionDateTime"
                  className={`form-control ${isFuture ? 'is-invalid' : ''}`}
                  value={actionDateTime}
                  onChange={(e) => setActionDateTime(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                {isFuture && (
                  <div className="invalid-feedback">
                    Action date/time cannot be in the future.
                  </div>
                )}
              </div>

              {/* Action Description */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="create-actionDescription" className="form-label small fw-bold">
                    Action Description <span className="text-danger">*</span>
                  </label>
                  <small className="text-muted">{actionDescription.length}/2000</small>
                </div>
                <textarea
                  id="create-actionDescription"
                  className="form-control"
                  rows={3}
                  placeholder="Describe the technical action performed..."
                  value={actionDescription}
                  onChange={(e) => setActionDescription(e.target.value)}
                  maxLength={2000}
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* Result */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="create-result" className="form-label small fw-bold">
                    Result / Outcome <span className="text-danger">*</span>
                  </label>
                  <small className="text-muted">{result.length}/2000</small>
                </div>
                <textarea
                  id="create-result"
                  className="form-control"
                  rows={3}
                  placeholder="Describe the observed result or outcome..."
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  maxLength={2000}
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* Follow-Up Required Toggle */}
              <div className="form-check form-switch mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="create-followUpRequired"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  disabled={isSubmitting}
                />
                <label className="form-check-label fw-bold small" htmlFor="create-followUpRequired">
                  Follow-up required?
                </label>
              </div>

              {/* Follow-Up Note (Conditionally Mandatory) */}
              {followUpRequired && (
                <div className="mb-3 p-3 bg-light rounded border border-warning">
                  <div className="d-flex justify-content-between">
                    <label htmlFor="create-followUpNote" className="form-label small fw-bold text-dark">
                      Follow-up Note <span className="text-danger">*</span>
                    </label>
                    <small className="text-muted">{followUpNote.length}/2000</small>
                  </div>
                  <textarea
                    id="create-followUpNote"
                    className="form-control"
                    rows={2}
                    placeholder="Specify required follow-up details..."
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    maxLength={2000}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              )}

              {/* Attachment Notes */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="create-attachmentNotes" className="form-label small fw-bold">
                    Attachment Notes (Optional)
                  </label>
                  <small className="text-muted">{attachmentNotes.length}/500</small>
                </div>
                <input
                  type="text"
                  id="create-attachmentNotes"
                  className="form-control"
                  placeholder="Specify attachment filenames to reference..."
                  value={attachmentNotes}
                  onChange={(e) => setAttachmentNotes(e.target.value)}
                  maxLength={500}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="modal-footer border-0 pt-0 px-4 pb-4">
              <button
                type="button"
                className="btn btn-outline-secondary"
                style={{ borderRadius: '50rem' }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn text-white fw-bold d-flex align-items-center gap-2"
                style={{ backgroundColor: '#006B3C', borderRadius: '50rem' }}
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Saving Action Taken...</span>
                  </>
                ) : (
                  'Save Action Taken'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface EditActionModalProps {
  ticketId: number;
  action: ActionTaken;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onReloadLatestAction: (actionId: number) => Promise<ActionTaken | null>;
}

export function EditActionModal({
  ticketId,
  action,
  isOpen,
  onClose,
  onSuccess,
  onReloadLatestAction
}: EditActionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const [actionDateTime, setActionDateTime] = useState<string>(() => toDatetimeLocal(action.actionDateTime));
  const [actionDescription, setActionDescription] = useState<string>(action.actionDescription);
  const [result, setResult] = useState<string>(action.result);
  const [followUpRequired, setFollowUpRequired] = useState<boolean>(action.followUpRequired);
  const [followUpNote, setFollowUpNote] = useState<string>(action.followUpNote || '');
  const [attachmentNotes, setAttachmentNotes] = useState<string>(action.attachmentNotes || '');
  const [actionLastUpdatedAt, setActionLastUpdatedAt] = useState<string>(action.updatedAt);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isConflict, setIsConflict] = useState<boolean>(false);

  useModalAccessibility(isOpen, onClose, modalRef, isSubmitting);

  if (!isOpen) return null;

  const isFuture = isFutureDate(actionDateTime);
  const isDescriptionValid = actionDescription.trim().length > 0 && actionDescription.trim().length <= 2000;
  const isResultValid = result.trim().length > 0 && result.trim().length <= 2000;
  const isFollowUpValid = !followUpRequired || (followUpNote.trim().length > 0 && followUpNote.trim().length <= 2000);
  const isAttachmentNotesValid = attachmentNotes.trim().length <= 500;
  const isFormValid = !isFuture && isDescriptionValid && isResultValid && isFollowUpValid && isAttachmentNotesValid;

  const handleReloadLatest = async () => {
    setIsReloading(true);
    try {
      const latest = await onReloadLatestAction(action.id);
      if (latest) {
        setActionDateTime(toDatetimeLocal(latest.actionDateTime));
        setActionDescription(latest.actionDescription);
        setResult(latest.result);
        setFollowUpRequired(latest.followUpRequired);
        setFollowUpNote(latest.followUpNote || '');
        setAttachmentNotes(latest.attachmentNotes || '');
        setActionLastUpdatedAt(latest.updatedAt);
        setIsConflict(false);
        setError('');
      } else {
        setError('Could not find latest version of this Action Taken. It may have been removed.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reload latest data.');
    } finally {
      setIsReloading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setError('');
    setIsConflict(false);
    setIsSubmitting(true);

    try {
      const payload = {
        actionLastUpdatedAt,
        actionDateTime: new Date(actionDateTime).toISOString(),
        actionDescription: actionDescription.trim(),
        result: result.trim(),
        followUpRequired,
        followUpNote: followUpRequired ? followUpNote.trim() : null,
        attachmentNotes: attachmentNotes.trim() ? attachmentNotes.trim() : null
      };

      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions/${action.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        // Concurrency conflict: keep modal open, preserve draft inputs
        setIsConflict(true);
        setError('This Action Taken was modified by another user. Your draft inputs have been preserved.');
      } else if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to update action taken.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while updating action taken.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-action-modal-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" ref={modalRef}>
        <div className="modal-content shadow border-0" style={{ borderRadius: '15px' }}>
          <div className="modal-header border-0 pb-0" style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
            <h5 className="modal-title fw-bold" id="edit-action-modal-title" style={{ color: '#006B3C' }}>
              Edit Action Taken
            </h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              disabled={isSubmitting}
              onClick={onClose}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {/* Stale CAS 409 Conflict Alert */}
              {isConflict && (
                <div className="alert alert-warning d-flex justify-content-between align-items-center mb-3" role="alert">
                  <div>
                    <strong>Conflict:</strong> This Action Taken was modified by another user. Your draft inputs have been preserved.
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-dark fw-bold ms-3"
                    onClick={handleReloadLatest}
                    disabled={isReloading || isSubmitting}
                  >
                    {isReloading ? 'Reloading...' : 'Reload Latest Data'}
                  </button>
                </div>
              )}

              {error && !isConflict && (
                <div className="alert alert-danger py-2 small mb-3" role="alert">
                  {error}
                </div>
              )}

              {/* Performer Read-Only Immutable display */}
              <div className="mb-3 p-3 bg-light rounded border">
                <small className="text-muted d-block fw-bold text-uppercase">Recorded By</small>
                <div className="fw-semibold text-dark">
                  Originally recorded by: {action.performedBy.name} ({action.performedBy.role})
                </div>
                <small className="text-muted">Performer identity remains permanently immutable.</small>
              </div>

              {/* Action Date / Time */}
              <div className="mb-3">
                <label htmlFor="edit-actionDateTime" className="form-label small fw-bold">
                  Action Date & Time <span className="text-danger">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="edit-actionDateTime"
                  className={`form-control ${isFuture ? 'is-invalid' : ''}`}
                  value={actionDateTime}
                  onChange={(e) => setActionDateTime(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                {isFuture && (
                  <div className="invalid-feedback">
                    Action date/time cannot be in the future.
                  </div>
                )}
              </div>

              {/* Action Description */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="edit-actionDescription" className="form-label small fw-bold">
                    Action Description <span className="text-danger">*</span>
                  </label>
                  <small className="text-muted">{actionDescription.length}/2000</small>
                </div>
                <textarea
                  id="edit-actionDescription"
                  className="form-control"
                  rows={3}
                  placeholder="Describe the technical action performed..."
                  value={actionDescription}
                  onChange={(e) => setActionDescription(e.target.value)}
                  maxLength={2000}
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* Result */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="edit-result" className="form-label small fw-bold">
                    Result / Outcome <span className="text-danger">*</span>
                  </label>
                  <small className="text-muted">{result.length}/2000</small>
                </div>
                <textarea
                  id="edit-result"
                  className="form-control"
                  rows={3}
                  placeholder="Describe the observed result or outcome..."
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  maxLength={2000}
                  disabled={isSubmitting}
                  required
                />
              </div>

              {/* Follow-Up Required Toggle */}
              <div className="form-check form-switch mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="edit-followUpRequired"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  disabled={isSubmitting}
                />
                <label className="form-check-label fw-bold small" htmlFor="edit-followUpRequired">
                  Follow-up required?
                </label>
              </div>

              {/* Follow-Up Note (Conditionally Mandatory) */}
              {followUpRequired && (
                <div className="mb-3 p-3 bg-light rounded border border-warning">
                  <div className="d-flex justify-content-between">
                    <label htmlFor="edit-followUpNote" className="form-label small fw-bold text-dark">
                      Follow-up Note <span className="text-danger">*</span>
                    </label>
                    <small className="text-muted">{followUpNote.length}/2000</small>
                  </div>
                  <textarea
                    id="edit-followUpNote"
                    className="form-control"
                    rows={2}
                    placeholder="Specify required follow-up details..."
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    maxLength={2000}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              )}

              {/* Attachment Notes */}
              <div className="mb-3">
                <div className="d-flex justify-content-between">
                  <label htmlFor="edit-attachmentNotes" className="form-label small fw-bold">
                    Attachment Notes (Optional)
                  </label>
                  <small className="text-muted">{attachmentNotes.length}/500</small>
                </div>
                <input
                  type="text"
                  id="edit-attachmentNotes"
                  className="form-control"
                  placeholder="Specify attachment filenames to reference..."
                  value={attachmentNotes}
                  onChange={(e) => setAttachmentNotes(e.target.value)}
                  maxLength={500}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="modal-footer border-0 pt-0 px-4 pb-4">
              <button
                type="button"
                className="btn btn-outline-secondary"
                style={{ borderRadius: '50rem' }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn text-white fw-bold d-flex align-items-center gap-2"
                style={{ backgroundColor: '#006B3C', borderRadius: '50rem' }}
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface RevisionHistoryModalProps {
  ticketId: number;
  actionId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function RevisionHistoryModal({ ticketId, actionId, isOpen, onClose }: RevisionHistoryModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const [revisions, setRevisions] = useState<ActionTakenRevision[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useModalAccessibility(isOpen, onClose, modalRef);

  const fetchRevisions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions/${actionId}/revisions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => {
          const diff = new Date(a.editedAt).getTime() - new Date(b.editedAt).getTime();
          return diff !== 0 ? diff : a.id - b.id;
        });
        setRevisions(list);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to load revision history.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while fetching revisions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRevisions();
    }
  }, [isOpen, ticketId, actionId]);

  if (!isOpen) return null;

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-history-modal-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" ref={modalRef}>
        <div className="modal-content shadow border-0" style={{ borderRadius: '15px', maxHeight: '85vh' }}>
          <div className="modal-header border-0 pb-0" style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
            <h5 className="modal-title fw-bold" id="revision-history-modal-title" style={{ color: '#006B3C' }}>
              Revision History - Action Taken #{actionId}
            </h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close revision history"
              onClick={onClose}
            />
          </div>

          <div className="modal-body p-4">
            {/* Loading State */}
            {loading && (
              <div className="text-center py-5">
                <div className="spinner-border text-success" role="status">
                  <span className="visually-hidden">Loading revision history...</span>
                </div>
                <p className="text-muted mt-2 small">Loading revision history...</p>
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                <div>{error}</div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={fetchRevisions}
                >
                  Retry Loading Revisions
                </button>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && revisions.length === 0 && (
              <div className="card border-0 bg-light p-4 text-center">
                <p className="text-muted mb-0">
                  No revisions recorded. This Action Taken has not been modified since creation.
                </p>
              </div>
            )}

            {/* Populated State */}
            {!loading && !error && revisions.length > 0 && (
              <div className="d-flex flex-column gap-3">
                {revisions.map((rev, index) => {
                  const b = rev.beforeSnapshot;
                  const a = rev.afterSnapshot;

                  const dateChanged = b.actionDateTime !== a.actionDateTime;
                  const descChanged = b.actionDescription !== a.actionDescription;
                  const resultChanged = b.result !== a.result;
                  const followUpReqChanged = b.followUpRequired !== a.followUpRequired;
                  const followUpNoteChanged = b.followUpNote !== a.followUpNote;
                  const attachmentNotesChanged = b.attachmentNotes !== a.attachmentNotes;

                  return (
                    <div
                      key={rev.id}
                      className="card border shadow-sm"
                      style={{ borderRadius: '12px', backgroundColor: '#ffffff' }}
                    >
                      <div className="card-header bg-light border-0 d-flex justify-content-between align-items-center py-2 px-3">
                        <div>
                          <strong className="text-dark">Revision #{index + 1}</strong>
                          <span className="text-muted small ms-2">
                            Edited by: {rev.editedBy.name} ({rev.editedBy.role})
                          </span>
                        </div>
                        <small className="text-muted">
                          {formatDisplayDateTime(rev.editedAt)}
                        </small>
                      </div>

                      <div className="card-body p-3">
                        <div className="table-responsive">
                          <table className="table table-sm table-bordered mb-0" style={{ fontSize: '0.875rem' }}>
                            <thead className="table-light">
                              <tr>
                                <th style={{ width: '25%' }}>Field</th>
                                <th style={{ width: '37.5%' }}>Before Edit</th>
                                <th style={{ width: '37.5%' }}>After Edit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Action Date / Time */}
                              <tr className={dateChanged ? 'table-warning' : ''}>
                                <td className="fw-semibold">Action Date/Time</td>
                                <td style={{ textDecoration: dateChanged ? 'line-through' : 'none', color: dateChanged ? '#dc3545' : 'inherit' }}>
                                  {formatDisplayDateTime(b.actionDateTime)}
                                </td>
                                <td style={{ color: dateChanged ? '#198754' : 'inherit', fontWeight: dateChanged ? 'bold' : 'normal' }}>
                                  {formatDisplayDateTime(a.actionDateTime)}
                                </td>
                              </tr>

                              {/* Description */}
                              <tr className={descChanged ? 'table-warning' : ''}>
                                <td className="fw-semibold">Description</td>
                                <td style={{ whiteSpace: 'pre-wrap', textDecoration: descChanged ? 'line-through' : 'none', color: descChanged ? '#dc3545' : 'inherit' }}>
                                  {b.actionDescription}
                                </td>
                                <td style={{ whiteSpace: 'pre-wrap', color: descChanged ? '#198754' : 'inherit', fontWeight: descChanged ? 'bold' : 'normal' }}>
                                  {a.actionDescription}
                                </td>
                              </tr>

                              {/* Result */}
                              <tr className={resultChanged ? 'table-warning' : ''}>
                                <td className="fw-semibold">Result</td>
                                <td style={{ whiteSpace: 'pre-wrap', textDecoration: resultChanged ? 'line-through' : 'none', color: resultChanged ? '#dc3545' : 'inherit' }}>
                                  {b.result}
                                </td>
                                <td style={{ whiteSpace: 'pre-wrap', color: resultChanged ? '#198754' : 'inherit', fontWeight: resultChanged ? 'bold' : 'normal' }}>
                                  {a.result}
                                </td>
                              </tr>

                              {/* Follow-up Required */}
                              <tr className={followUpReqChanged ? 'table-warning' : ''}>
                                <td className="fw-semibold">Follow-Up Required</td>
                                <td style={{ textDecoration: followUpReqChanged ? 'line-through' : 'none', color: followUpReqChanged ? '#dc3545' : 'inherit' }}>
                                  {b.followUpRequired ? 'Yes' : 'No'}
                                </td>
                                <td style={{ color: followUpReqChanged ? '#198754' : 'inherit', fontWeight: followUpReqChanged ? 'bold' : 'normal' }}>
                                  {a.followUpRequired ? 'Yes' : 'No'}
                                </td>
                              </tr>

                              {/* Follow-up Note */}
                              {(b.followUpNote !== null || a.followUpNote !== null || followUpNoteChanged) && (
                                <tr className={followUpNoteChanged ? 'table-warning' : ''}>
                                  <td className="fw-semibold">Follow-Up Note</td>
                                  <td style={{ whiteSpace: 'pre-wrap', textDecoration: followUpNoteChanged ? 'line-through' : 'none', color: followUpNoteChanged ? '#dc3545' : 'inherit' }}>
                                    {b.followUpNote ?? '(none)'}
                                  </td>
                                  <td style={{ whiteSpace: 'pre-wrap', color: followUpNoteChanged ? '#198754' : 'inherit', fontWeight: followUpNoteChanged ? 'bold' : 'normal' }}>
                                    {a.followUpNote ?? '(none)'}
                                  </td>
                                </tr>
                              )}

                              {/* Attachment Notes */}
                              {(b.attachmentNotes !== null || a.attachmentNotes !== null || attachmentNotesChanged) && (
                                <tr className={attachmentNotesChanged ? 'table-warning' : ''}>
                                  <td className="fw-semibold">Attachment Notes</td>
                                  <td style={{ textDecoration: attachmentNotesChanged ? 'line-through' : 'none', color: attachmentNotesChanged ? '#dc3545' : 'inherit' }}>
                                    {b.attachmentNotes ?? '(none)'}
                                  </td>
                                  <td style={{ color: attachmentNotesChanged ? '#198754' : 'inherit', fontWeight: attachmentNotesChanged ? 'bold' : 'normal' }}>
                                    {a.attachmentNotes ?? '(none)'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-footer border-0 pt-0 px-4 pb-4">
            <button
              type="button"
              className="btn btn-outline-secondary"
              style={{ borderRadius: '50rem' }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionsTaken({ ticketId, onTicketUpdated, onActionsLoaded }: ActionsTakenProps) {
  const { user } = useAuth();
  const canManageActions = user?.role === 'IT Staff' || user?.role === 'Administrator';

  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editingAction, setEditingAction] = useState<ActionTaken | null>(null);
  const [historyActionId, setHistoryActionId] = useState<number | null>(null);

  const fetchActions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          // Sort chronologically (actionDateTime ASC, id ASC)
          data.sort((a: ActionTaken, b: ActionTaken) => {
            const diff = new Date(a.actionDateTime).getTime() - new Date(b.actionDateTime).getTime();
            return diff !== 0 ? diff : a.id - b.id;
          });
          setActions(data);
          onActionsLoaded?.(data.length);
        } else {
          setActions([]);
          onActionsLoaded?.(0);
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to load actions taken.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while fetching actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, [ticketId]);

  const handleActionCreatedOrEdited = () => {
    fetchActions();
    onTicketUpdated?.();
  };

  const handleReloadLatestAction = async (actionId: number): Promise<ActionTaken | null> => {
    try {
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setActions(data);
          const found = data.find((a: ActionTaken) => a.id === actionId);
          return found || null;
        }
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  return (
    <div className="mb-4">
      {/* Header bar */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-bold mb-0" style={{ color: '#006B3C' }}>
          Actions Taken ({actions.length})
        </h5>
        {canManageActions && (
          <button
            type="button"
            data-testid="add-action-taken-btn"
            className="btn btn-sm text-white fw-bold d-flex align-items-center gap-1"
            style={{ backgroundColor: '#006B3C', borderRadius: '50rem' }}
            onClick={() => setIsCreateOpen(true)}
          >
            + Add Action Taken
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card border-0 shadow-sm p-4 text-center" style={{ backgroundColor: '#ffffff', borderRadius: '15px' }}>
          <div className="spinner-border text-success mx-auto" role="status">
            <span className="visually-hidden">Loading actions taken...</span>
          </div>
          <small className="text-muted mt-2 d-block">Loading actions taken...</small>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <div>{error}</div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            style={{ borderRadius: '50rem' }}
            onClick={fetchActions}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && actions.length === 0 && (
        <div className="card border-0 shadow-sm p-4 text-center text-muted" style={{ backgroundColor: '#ffffff', borderRadius: '15px' }}>
          {canManageActions
            ? "No actions recorded yet. Click '+ Add Action Taken' to log initial technical work."
            : "No actions recorded yet. IT Staff will log updates here as work progresses."}
        </div>
      )}

      {/* Timeline items */}
      {!loading && !error && actions.length > 0 && (
        <div className="d-flex flex-column gap-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="card border-0 shadow-sm"
              style={{ backgroundColor: '#ffffff', borderRadius: '15px' }}
            >
              <div className="card-body p-4">
                {/* Top bar: date/time and performer badge */}
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span
                      className="badge text-white"
                      style={{ backgroundColor: '#006B3C', borderRadius: '50rem', padding: '0.4rem 0.8rem' }}
                    >
                      Recorded by: {action.performedBy.name}
                    </span>
                    <span className="badge bg-light text-secondary border" style={{ borderRadius: '50rem' }}>
                      {action.performedBy.role}
                    </span>
                  </div>
                  <small className="text-muted">
                    {formatDisplayDateTime(action.actionDateTime)}
                  </small>
                </div>

                {/* Description */}
                <div className="mb-3">
                  <small className="text-muted fw-bold d-block text-uppercase mb-1" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                    Action Description
                  </small>
                  <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-wrap' }}>
                    {action.actionDescription}
                  </p>
                </div>

                {/* Result */}
                <div className="mb-3 p-3 rounded" style={{ backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9' }}>
                  <small className="text-success fw-bold d-block text-uppercase mb-1" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                    Result / Outcome
                  </small>
                  <p className="mb-0 text-dark" style={{ whiteSpace: 'pre-wrap' }}>
                    {action.result}
                  </p>
                </div>

                {/* Follow-up Note & Attachment Notes */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  {action.followUpRequired ? (
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <span className="badge bg-warning text-dark" style={{ borderRadius: '50rem', padding: '0.4rem 0.8rem' }}>
                        Follow-Up Required
                      </span>
                      {action.followUpNote && (
                        <span className="text-muted small">
                          <strong>Note:</strong> {action.followUpNote}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="badge bg-light text-muted border" style={{ borderRadius: '50rem' }}>
                      No follow-up needed
                    </span>
                  )}

                  {action.attachmentNotes && (
                    <span className="badge bg-light text-dark border" style={{ borderRadius: '50rem' }}>
                      📎 File Reference: {action.attachmentNotes}
                    </span>
                  )}
                </div>

                {/* Action Controls (Staff and Admin only) */}
                {canManageActions && (
                  <div className="d-flex gap-2 justify-content-end border-top pt-3">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary fw-semibold"
                      style={{ borderRadius: '50rem' }}
                      aria-label="Edit Action Taken"
                      onClick={() => setEditingAction(action)}
                    >
                      Edit Action
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-info fw-semibold"
                      style={{ borderRadius: '50rem' }}
                      aria-label="View Action Taken Revision History"
                      onClick={() => setHistoryActionId(action.id)}
                    >
                      View History
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <CreateActionModal
          ticketId={ticketId}
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={handleActionCreatedOrEdited}
        />
      )}

      {/* Edit Modal */}
      {editingAction && (
        <EditActionModal
          ticketId={ticketId}
          action={editingAction}
          isOpen={Boolean(editingAction)}
          onClose={() => setEditingAction(null)}
          onSuccess={handleActionCreatedOrEdited}
          onReloadLatestAction={handleReloadLatestAction}
        />
      )}

      {/* Revision History Modal */}
      {historyActionId !== null && (
        <RevisionHistoryModal
          ticketId={ticketId}
          actionId={historyActionId}
          isOpen={historyActionId !== null}
          onClose={() => setHistoryActionId(null)}
        />
      )}
    </div>
  );
}
export default ActionsTaken;
