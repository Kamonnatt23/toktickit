import { Router, Response } from "express";
import crypto from "crypto";
import { getPrisma } from "../prisma.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { parseStrictIsoTimestamp } from "../utils/timestamp.js";

const router = Router();

// GET /api/tickets/:id/actions
// Retrieve the ordered timeline of Actions Taken for a specific ticket
router.get("/tickets/:id/actions", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket ID" });
    }

    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const user = req.user!;
    if (user.role === 'Requester' && ticket.requesterId !== user.id) {
      // Non-enumeration: Return 404 for tickets not belonging to requester
      return res.status(404).json({ error: "Ticket not found" });
    }

    const actions = await prisma.actionTaken.findMany({
      where: { ticketId },
      orderBy: [
        { actionDateTime: 'asc' },
        { id: 'asc' }
      ],
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    return res.status(200).json(actions);
  } catch (err) {
    console.error("Error fetching actions taken:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tickets/:id/actions
// Create a new Action Taken line with mandatory UUIDv4 Idempotency-Key
router.post("/tickets/:id/actions", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  const user = req.user!;
  if (user.role !== 'IT Staff' && user.role !== 'Administrator') {
    return res.status(403).json({ error: "Forbidden: Only IT Staff and Administrators can create Actions Taken" });
  }

  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }

  const idempotencyKey = req.header('Idempotency-Key');

  // 1. Mandatory UUIDv4 Idempotency-Key header validation
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key header is required. Must be UUIDv4." });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
  }

  const {
    actionDescription,
    result,
    actionDateTime,
    followUpRequired,
    followUpNote,
    attachmentNotes
  } = req.body;

  // 2. Validate all request fields upfront before any database pre-lookup, pruning, or reservation
  if (typeof actionDescription !== 'string' || actionDescription.trim().length < 1 || actionDescription.trim().length > 2000) {
    return res.status(400).json({ error: "actionDescription is required and must be 1-2000 characters after trimming." });
  }
  const normalizedActionDescription = actionDescription.trim();

  if (typeof result !== 'string' || result.trim().length < 1 || result.trim().length > 2000) {
    return res.status(400).json({ error: "result is required and must be 1-2000 characters after trimming." });
  }
  const normalizedResult = result.trim();

  let effectiveActionDateTime: Date;
  if (actionDateTime !== undefined && actionDateTime !== null) {
    const parsed = parseStrictIsoTimestamp(actionDateTime);
    if (!parsed) {
      return res.status(400).json({ error: "actionDateTime must be a valid strict ISO 8601 timestamp." });
    }
    if (parsed > new Date()) {
      return res.status(400).json({ error: "actionDateTime cannot be in the future." });
    }
    effectiveActionDateTime = parsed;
  } else {
    effectiveActionDateTime = new Date();
  }

  if (typeof followUpRequired !== 'boolean') {
    return res.status(400).json({ error: "followUpRequired must be an actual boolean." });
  }

  let normalizedFollowUpNote: string | null = null;
  if (followUpRequired === true) {
    if (typeof followUpNote !== 'string' || followUpNote.trim().length < 1 || followUpNote.trim().length > 2000) {
      return res.status(400).json({ error: "followUpNote is required (1-2000 characters) when followUpRequired is true." });
    }
    normalizedFollowUpNote = followUpNote.trim();
  } else {
    if (followUpNote !== null && followUpNote !== undefined) {
      return res.status(400).json({ error: "followUpNote must be null when followUpRequired is false." });
    }
    normalizedFollowUpNote = null;
  }

  let normalizedAttachmentNotes: string | null = null;
  if (attachmentNotes !== undefined && attachmentNotes !== null) {
    if (typeof attachmentNotes !== 'string') {
      return res.status(400).json({ error: "attachmentNotes must be a string or null." });
    }
    const trimmed = attachmentNotes.trim();
    if (trimmed.length > 500) {
      return res.status(400).json({ error: "attachmentNotes cannot exceed 500 characters." });
    }
    normalizedAttachmentNotes = trimmed.length > 0 ? trimmed : null;
  }

  // 3. Build canonical payload strictly from validated, normalized values (excluding performedById)
  const canonicalPayload = {
    actionDateTime: actionDateTime !== undefined && actionDateTime !== null ? effectiveActionDateTime.toISOString() : undefined,
    actionDescription: normalizedActionDescription,
    attachmentNotes: normalizedAttachmentNotes,
    followUpNote: normalizedFollowUpNote,
    followUpRequired,
    result: normalizedResult
  };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

  const prisma = getPrisma();

  try {
    // 4. Pre-lookup IdempotencyKey and handle 24-hour expiration
    const existingKey = await prisma.idempotencyKey.findUnique({
      where: {
        route_ticketId_userId_key: {
          route: "POST /api/tickets/:id/actions",
          ticketId,
          userId: user.id,
          key: idempotencyKey
        }
      }
    });

    if (existingKey) {
      if (existingKey.expiresAt > new Date()) {
        if (existingKey.statusCode !== null && existingKey.responseBody !== null) {
          if (existingKey.requestHash === requestHash) {
            res.setHeader('Idempotency-Replayed', 'true');
            return res.status(existingKey.statusCode).json(JSON.parse(existingKey.responseBody));
          }
          return res.status(409).json({ error: "Idempotency key reused with different request payload" });
        }
      } else {
        // Expired entry (> 24 hours): prune safely using deleteMany to tolerate concurrent purges
        await prisma.idempotencyKey.deleteMany({
          where: { id: existingKey.id, expiresAt: { lte: new Date() } }
        });
      }
    }

    // 5. In-Transaction execution: Two-Phase In-Transaction Reservation
    const createdAction = await prisma.$transaction(async (tx) => {
      // 5.1 Read-only verification of parent ticket existence
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        const err = new Error("Ticket not found");
        (err as any).status = 404;
        throw err;
      }

      // 5.2 Phase 1 Reservation Claim (before domain mutation or CAS update)
      const reservation = await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          route: "POST /api/tickets/:id/actions",
          ticketId,
          userId: user.id,
          requestHash,
          statusCode: null,
          responseBody: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      // 5.3 Create ActionTaken record with immutable session actor
      const action = await tx.actionTaken.create({
        data: {
          ticketId,
          actionDateTime: effectiveActionDateTime,
          actionDescription: normalizedActionDescription,
          result: normalizedResult,
          performedById: user.id,
          followUpRequired,
          followUpNote: normalizedFollowUpNote,
          attachmentNotes: normalizedAttachmentNotes
        },
        include: {
          performedBy: { select: { id: true, name: true, role: true, email: true } }
        }
      });

      // 5.4 Atomically refresh parent Ticket.updatedAt
      await tx.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() }
      });

      // 5.5 Finalize idempotency reservation with response payload and status before commit
      await tx.idempotencyKey.update({
        where: { id: reservation.id },
        data: {
          statusCode: 201,
          responseBody: JSON.stringify(action)
        }
      });

      return action;
    });

    // Send HTTP response strictly after transaction commit
    return res.status(201).json(createdAction);
  } catch (err: any) {
    const target = err.meta?.target;
    const isExactFieldArray = Array.isArray(target) &&
      target.length === 4 &&
      ['route', 'ticketId', 'userId', 'key'].every((f) => target.includes(f));
    const isTargetMatch = isExactFieldArray ||
      (typeof target === 'string' && target.includes('route_ticketId_userId_key')) ||
      (Array.isArray(target) && target.some((t: string) => typeof t === 'string' && t.includes('key')));
    const isIdempotencyKeyCollision = err.code === 'P2002' && isTargetMatch;

    if (isIdempotencyKeyCollision && idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          route_ticketId_userId_key: {
            route: "POST /api/tickets/:id/actions",
            ticketId,
            userId: user.id,
            key: idempotencyKey
          }
        }
      });

      if (!existing || existing.statusCode === null || existing.responseBody === null) {
        console.error("Invariant violation: Committed IdempotencyKey record is missing finalized response data", {
          key: idempotencyKey,
          route: "POST /api/tickets/:id/actions",
          ticketId,
          userId: user.id
        });
        return res.status(500).json({ error: "Internal server error" });
      }

      if (existing.expiresAt > new Date()) {
        if (existing.requestHash === requestHash) {
          res.setHeader("Idempotency-Replayed", "true");
          return res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
        }
        return res.status(409).json({ error: "Idempotency key reused with different request payload" });
      }
    }

    if (err.code === 'P2002') {
      throw err;
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Error creating action taken:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tickets/:id/actions/:actionId
// Update an existing Action Taken record via atomic Compare-And-Swap
router.patch("/tickets/:id/actions/:actionId", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  const user = req.user!;
  if (user.role !== 'IT Staff' && user.role !== 'Administrator') {
    return res.status(403).json({ error: "Forbidden: Only IT Staff and Administrators can update Actions Taken" });
  }

  const ticketId = parseInt(req.params.id, 10);
  const actionId = parseInt(req.params.actionId, 10);
  if (isNaN(ticketId) || isNaN(actionId)) {
    return res.status(400).json({ error: "Invalid ticket ID or action ID" });
  }

  const {
    actionLastUpdatedAt,
    actionDescription,
    result,
    actionDateTime,
    followUpRequired,
    followUpNote,
    attachmentNotes
  } = req.body;

  // 1. Validate the mandatory CAS token before any database mutation using strict parser
  const parsedExpectedUpdatedAt = parseStrictIsoTimestamp(actionLastUpdatedAt);
  if (!parsedExpectedUpdatedAt) {
    return res.status(400).json({
      error: "actionLastUpdatedAt is required and must be a valid strict ISO 8601 timestamp."
    });
  }
  const expectedActionLastUpdatedAt = parsedExpectedUpdatedAt;

  // 2. At least one mutable field must be supplied
  const mutableFields = [
    actionDescription,
    result,
    actionDateTime,
    followUpRequired,
    followUpNote,
    attachmentNotes
  ];

  if (mutableFields.every((field) => field === undefined)) {
    return res.status(400).json({
      error: "At least one mutable field must be provided for update."
    });
  }

  // 3. Validate supplied values before entering the transaction
  if (actionDescription !== undefined) {
    if (typeof actionDescription !== 'string' || actionDescription.trim().length < 1 || actionDescription.trim().length > 2000) {
      return res.status(400).json({
        error: "actionDescription must be 1-2000 characters after trimming."
      });
    }
  }

  if (result !== undefined) {
    if (typeof result !== 'string' || result.trim().length < 1 || result.trim().length > 2000) {
      return res.status(400).json({
        error: "result must be 1-2000 characters after trimming."
      });
    }
  }

  let parsedActionDateTime: Date | undefined;
  if (actionDateTime !== undefined) {
    parsedActionDateTime = parseStrictIsoTimestamp(actionDateTime) ?? undefined;
    if (!parsedActionDateTime) {
      return res.status(400).json({
        error: "actionDateTime must be a valid strict ISO 8601 timestamp."
      });
    }
    if (parsedActionDateTime > new Date()) {
      return res.status(400).json({
        error: "actionDateTime cannot be in the future."
      });
    }
  }

  if (
    followUpRequired !== undefined &&
    typeof followUpRequired !== 'boolean'
  ) {
    return res.status(400).json({
      error: "followUpRequired must be a boolean."
    });
  }

  if (followUpNote !== undefined && followUpNote !== null) {
    if (typeof followUpNote !== 'string' || followUpNote.trim().length < 1 || followUpNote.trim().length > 2000) {
      return res.status(400).json({
        error: "followUpNote must be a string of 1-2000 characters after trimming."
      });
    }
  }

  if (
    attachmentNotes !== undefined &&
    attachmentNotes !== null &&
    typeof attachmentNotes !== 'string'
  ) {
    return res.status(400).json({
      error: "attachmentNotes must be a string or null."
    });
  }

  if (
    typeof attachmentNotes === 'string' &&
    attachmentNotes.trim().length > 500
  ) {
    return res.status(400).json({
      error: "attachmentNotes cannot exceed 500 characters."
    });
  }

  const prisma = getPrisma();

  try {
    // 4. Execute CAS, compare effective values, and write revision atomically
    const updated = await prisma.$transaction(async (tx) => {
      // 4.1 Fetch the existing Action Taken and verify parent association
      const existing = await tx.actionTaken.findFirst({
        where: {
          id: actionId,
          ticketId
        }
      });

      if (!existing) {
        const err = new Error("Action Taken not found");
        (err as any).status = 404;
        throw err;
      }

      // 4.2 Merge supplied values with existing values.
      // Omitted fields must preserve their existing values.
      const nextActionDateTime =
        parsedActionDateTime !== undefined
          ? parsedActionDateTime
          : existing.actionDateTime;

      const nextActionDescription =
        actionDescription !== undefined
          ? actionDescription.trim()
          : existing.actionDescription;

      const nextResult =
        result !== undefined
          ? result.trim()
          : existing.result;

      const nextFollowUpRequired =
        followUpRequired !== undefined
          ? followUpRequired
          : existing.followUpRequired;

      let nextFollowUpNote: string | null;

      if (nextFollowUpRequired === false) {
        nextFollowUpNote = null;
      } else if (followUpNote !== undefined) {
        nextFollowUpNote =
          typeof followUpNote === 'string'
            ? followUpNote.trim()
            : null;
      } else {
        nextFollowUpNote = existing.followUpNote;
      }

      // Validate effective merged note before CAS update
      if (
        nextFollowUpRequired === true &&
        (
          typeof nextFollowUpNote !== 'string' ||
          nextFollowUpNote.trim().length < 1 ||
          nextFollowUpNote.trim().length > 2000
        )
      ) {
        const err = new Error(
          "followUpNote is required (1-2000 characters) when the resulting followUpRequired value is true."
        );
        (err as any).status = 400;
        throw err;
      }

      const nextAttachmentNotes =
        attachmentNotes !== undefined
          ? (
              typeof attachmentNotes === 'string' &&
              attachmentNotes.trim() !== ''
            )
            ? attachmentNotes.trim()
            : null
          : existing.attachmentNotes;

      // 4.3 Build complete before/after snapshots
      const beforeSnapshot = {
        actionDateTime: existing.actionDateTime.toISOString(),
        actionDescription: existing.actionDescription,
        result: existing.result,
        followUpRequired: existing.followUpRequired,
        followUpNote: existing.followUpNote,
        attachmentNotes: existing.attachmentNotes
      };

      const afterSnapshot = {
        actionDateTime: nextActionDateTime.toISOString(),
        actionDescription: nextActionDescription,
        result: nextResult,
        followUpRequired: nextFollowUpRequired,
        followUpNote: nextFollowUpNote,
        attachmentNotes: nextAttachmentNotes
      };

      // 4.4 Detect whether any normalized editable value actually changed
      const hasChanges =
        nextActionDateTime.getTime() !== existing.actionDateTime.getTime() ||
        nextActionDescription !== existing.actionDescription ||
        nextResult !== existing.result ||
        nextFollowUpRequired !== existing.followUpRequired ||
        nextFollowUpNote !== existing.followUpNote ||
        nextAttachmentNotes !== existing.attachmentNotes;

      // 4.5 Perform database-level CAS
      const changedAt = new Date();

      const updateResult = await tx.actionTaken.updateMany({
        where: {
          id: actionId,
          ticketId,
          updatedAt: expectedActionLastUpdatedAt
        },
        data: hasChanges
          ? {
              actionDateTime: nextActionDateTime,
              actionDescription: nextActionDescription,
              result: nextResult,
              followUpRequired: nextFollowUpRequired,
              followUpNote: nextFollowUpNote,
              attachmentNotes: nextAttachmentNotes,
              updatedAt: changedAt
            }
          : {
              // Deliberate no-op CAS check.
              // Keep the logical timestamp unchanged.
              updatedAt: existing.updatedAt
            }
      });

      // 4.6 Distinguish missing records from stale CAS tokens
      if (updateResult.count === 0) {
        const current = await tx.actionTaken.findFirst({
          where: {
            id: actionId,
            ticketId
          }
        });

        if (!current) {
          const err = new Error("Action Taken not found");
          (err as any).status = 404;
          throw err;
        }

        const err = new Error(
          "Action Taken was modified by another session. Please reload and try again."
        );
        (err as any).status = 409;
        throw err;
      }

      // 4.7 Only a real change creates exactly one append-only revision
      if (hasChanges) {
        await tx.actionTakenRevision.create({
          data: {
            actionTakenId: actionId,
            editedById: user.id,
            beforeSnapshot,
            afterSnapshot
          }
        });

        // Refresh parent Ticket only for a real Action Taken edit
        await tx.ticket.update({
          where: {
            id: ticketId
          },
          data: {
            updatedAt: changedAt
          }
        });
      }

      // 4.8 Return the final Action Taken record
      const updatedAction = await tx.actionTaken.findUnique({
        where: {
          id: actionId
        },
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              role: true,
              email: true
            }
          }
        }
      });

      if (!updatedAction) {
        const err = new Error("Action Taken not found");
        (err as any).status = 404;
        throw err;
      }

      return updatedAction;
    });

    return res.status(200).json(updated);
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message
      });
    }

    console.error("Error updating action taken:", err);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

// GET /api/tickets/:id/actions/:actionId/revisions
// Retrieve the ordered timeline of revision history for a specific Action Taken
router.get("/tickets/:id/actions/:actionId/revisions", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const actionId = parseInt(req.params.actionId, 10);

    if (isNaN(ticketId) || isNaN(actionId)) {
      return res.status(400).json({ error: "Invalid ticket ID or action ID" });
    }

    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const user = req.user!;
    if (user.role === 'Requester') {
      if (ticket.requesterId === user.id) {
        return res.status(403).json({ error: "Forbidden: Requesters cannot view revision history" });
      }
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (user.role !== 'IT Staff' && user.role !== 'Administrator') {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }

    const action = await prisma.actionTaken.findFirst({
      where: { id: actionId, ticketId },
      select: { id: true }
    });

    if (!action) {
      return res.status(404).json({ error: "Action Taken not found" });
    }

    const revisions = await prisma.actionTakenRevision.findMany({
      where: { actionTakenId: actionId },
      orderBy: [
        { editedAt: 'asc' },
        { id: 'asc' }
      ],
      include: {
        editedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    return res.status(200).json(revisions);
  } catch (err) {
    console.error("Error fetching action revisions:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
