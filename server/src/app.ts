import express, { Request, Response } from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import attachmentsRouter from "./attachments.js";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth.middleware.js";

let prisma: PrismaClient;

export function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/attachments", attachmentsRouter);

app.get("/", (_req: Request, res: Response) => {
  res.send("TokTickIT API is running! Access /api/health to check status.");
});

// ---------------------------------------------------------------------------
// Issue 2 โ€” API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    
    res.status(200).json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

app.get("/api/dev/users", async (_req: Request, res: Response) => {
  try {
    const users = await getPrisma().user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    
    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching dev users:", err);
    res.status(500).json({ error: "Failed to load mock users" });
  }
});

app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const systems = await getPrisma().relatedSystem.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(systems);
  } catch (err) {
    console.error("Error fetching related systems:", err);
    res.status(500).json({ error: "Failed to load related systems" });
  }
});

app.post("/api/tickets", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== 'Requester') {
      return res.status(403).json({ error: "Forbidden: Only Requesters can create tickets" });
    }
    const requesterId = user.id;

    const { categoryId, relatedSystemId, summary, priority, description, attachmentIds } = req.body;
    
    const trimmedSummary = String(summary || '').trim();
    const trimmedDescription = String(description || '').trim();
    
    if (!categoryId || !relatedSystemId || !trimmedSummary || !priority || !trimmedDescription) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (trimmedSummary.length > 100) {
      return res.status(400).json({ error: "Summary exceeds maximum length of 100 characters" });
    }
    
    if (trimmedDescription.length > 1000) {
      return res.status(400).json({ error: "Description exceeds maximum length of 1000 characters" });
    }
    
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: "Invalid priority" });
    }

    const categoryExists = await getPrisma().category.findUnique({ where: { id: parseInt(categoryId, 10) } });
    const systemExists = await getPrisma().relatedSystem.findUnique({ where: { id: parseInt(relatedSystemId, 10) } });
    
    if (!categoryExists || !systemExists) {
      return res.status(400).json({ error: "Invalid category or related system" });
    }

    let parsedAttachmentIds: number[] = [];
    if (Array.isArray(attachmentIds)) {
      parsedAttachmentIds = attachmentIds.map((id: any) => parseInt(id, 10)).filter(id => !isNaN(id));
      if (parsedAttachmentIds.length > 5) {
        return res.status(400).json({ error: "Cannot link more than 5 attachments" });
      }
      
      // Verify attachments exist and are not already linked or deleted
      if (parsedAttachmentIds.length > 0) {
        const existingAttachments = await getPrisma().attachment.findMany({
          where: { id: { in: parsedAttachmentIds }, isDeleted: false }
        });
        
        if (existingAttachments.length !== parsedAttachmentIds.length) {
          return res.status(400).json({ error: "One or more attachments are invalid, deleted, or do not exist" });
        }
        
        for (const att of existingAttachments) {
          if (att.ticketId !== null) {
            return res.status(400).json({ error: "One or more attachments are already linked to a ticket" });
          }
        }
      }
    }

    const ticket = await getPrisma().ticket.create({
      data: {
        categoryId: parseInt(categoryId, 10),
        relatedSystemId: parseInt(relatedSystemId, 10),
        summary: trimmedSummary,
        priority,
        description: trimmedDescription,
        status: "New",
        requesterId,
      }
    });

    if (parsedAttachmentIds.length > 0) {
      await getPrisma().attachment.updateMany({
        where: { id: { in: parsedAttachmentIds } },
        data: { ticketId: ticket.id }
      });
    }

    const ticketNumber = `TKT-${String(ticket.id).padStart(3, '0')}`;

    return res.status(201).json({ ...ticket, ticketNumber });
  } catch (err) {
    console.error("Error creating ticket:", err);
    return res.status(500).json({ error: "Failed to create ticket" });
  }
});


app.get("/api/staff/tickets", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    if (user.role === 'Requester') {
      return res.status(403).json({ error: "Forbidden: Requesters cannot access the Staff Queue" });
    }

    const { search, status, categoryId, ownerId, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '10' } = req.query;

    let pageNum = parseInt(page as string, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    
    let limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
    if (limitNum > 50) limitNum = 50;
    
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};

    if (status && typeof status === 'string' && status !== 'All') {
      whereClause.status = status;
    }

    if (categoryId && typeof categoryId === 'string' && categoryId !== 'All') {
      const catId = parseInt(categoryId, 10);
      if (!isNaN(catId)) whereClause.categoryId = catId;
    }

    if (ownerId && typeof ownerId === 'string' && ownerId !== 'All') {
      if (ownerId === 'Unassigned') {
        whereClause.ownerId = null;
      } else {
        const oId = parseInt(ownerId, 10);
        if (!isNaN(oId)) whereClause.ownerId = oId;
      }
    }

    if (search && typeof search === 'string') {
      const searchStr = search.trim();
      const searchIdMatch = searchStr.match(/^TKT-0*(\d+)$/i) || searchStr.match(/^(\d+)$/);
      
      if (searchIdMatch) {
         whereClause.id = parseInt(searchIdMatch[1], 10);
      } else {
         whereClause.summary = { contains: searchStr, mode: 'insensitive' };
      }
    }

    const validSortFields = ['createdAt', 'priority', 'itPriority', 'status'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    const [tickets, total] = await Promise.all([
      getPrisma().ticket.findMany({
        where: whereClause,
        include: { 
          category: true, 
          relatedSystem: true,
          requester: { select: { id: true, name: true, email: true } },
          owner: { select: { id: true, name: true, email: true } }
        },
        orderBy: { [sortField]: order },
        skip,
        take: limitNum,
      }),
      getPrisma().ticket.count({ where: whereClause })
    ]);

    const data = tickets.map(t => ({
      ...t,
      ticketNumber: `TKT-${String(t.id).padStart(3, '0')}`
    }));

    return res.status(200).json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error("Error fetching staff tickets:", err);
    return res.status(500).json({ error: "Failed to fetch staff queue" });
  }
});



// PATCH /api/staff/tickets/:id/assign
app.patch("/api/staff/tickets/:id/assign", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== 'IT Staff') {
      return res.status(403).json({ error: "Forbidden: Only IT Staff can assign tickets" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket ID" });
    }

    const { ownerId } = req.body;
    if (ownerId !== null && ownerId !== undefined && typeof ownerId !== 'number') {
      return res.status(400).json({ error: "Invalid ownerId format" });
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ownerId !== null && ownerId !== undefined) {
      const targetUser = await getPrisma().user.findUnique({ where: { id: ownerId } });
      if (!targetUser || targetUser.role !== 'IT Staff' || !targetUser.isActive) {
        return res.status(400).json({ error: "Target owner must be an active IT Staff user" });
      }
    }

    const updatedTicket = await getPrisma().ticket.update({
      where: { id: ticketId },
      data: { ownerId: ownerId === undefined ? ticket.ownerId : ownerId }
    });

    return res.status(200).json(updatedTicket);
  } catch (err) {
    console.error("Error assigning ticket:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/staff/tickets/:id/status
app.patch("/api/staff/tickets/:id/status", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== 'IT Staff') {
      return res.status(403).json({ error: "Forbidden: Only IT Staff can update ticket status" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket ID" });
    }

    const { status, itPriority, comment, reason } = req.body;

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (itPriority && !validPriorities.includes(itPriority)) {
      return res.status(400).json({ error: "Invalid IT Priority" });
    }

    const transitions: Record<string, string[]> = {
      'New': ['Open', 'Cancelled'],
      'Open': ['In Progress', 'Waiting for Requester'],
      'Waiting for Requester': ['Open', 'In Progress'],
      'In Progress': ['Resolved', 'Waiting for Requester'],
      'Resolved': ['Closed'],
      'Closed': ['Reopened'],
      'Cancelled': []
    };

    if (status && status !== ticket.status) {
      const allowed = transitions[ticket.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Invalid transition from ${ticket.status} to ${status}` });
      }

      // Check required conditions
      if (status === 'In Progress' && ticket.status === 'Open') {
        if (!ticket.ownerId) {
          return res.status(400).json({ error: "Ticket must be assigned before moving to In Progress" });
        }
      }

      if (status === 'Open' && ticket.status === 'New') {
        if (!ticket.ownerId) {
          return res.status(400).json({ error: "Ticket must be claimed/assigned before opening" });
        }
      }

      if (status === 'Cancelled' && ticket.status === 'New') {
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
          return res.status(400).json({ error: "Cancellation reason is required" });
        }
      }

      if (status === 'Waiting for Requester' && ['Open', 'In Progress'].includes(ticket.status)) {
        if (!comment || typeof comment !== 'string' || comment.trim() === '') {
          return res.status(400).json({ error: "Public comment is required" });
        }
      }

      if (status === 'Resolved' && ticket.status === 'In Progress') {
        if (!comment || typeof comment !== 'string' || comment.trim() === '') {
          return res.status(400).json({ error: "Resolution comment is required" });
        }
      }
    }

    // Prepare transaction
    const transactionOps = [];
    const updateData: any = {};
    if (status) updateData.status = status;
    if (itPriority) updateData.itPriority = itPriority;

    if (Object.keys(updateData).length > 0) {
      transactionOps.push(getPrisma().ticket.update({
        where: { id: ticketId },
        data: updateData
      }));
    }

    if (status === 'Cancelled' && ticket.status === 'New' && reason) {
      transactionOps.push(getPrisma().internalNote.create({
        data: {
          content: `Cancellation Reason: ${reason}`,
          ticketId: ticketId,
          authorId: user.id
        }
      }));
    }

    if (status === 'Waiting for Requester' && ['Open', 'In Progress'].includes(ticket.status) && comment) {
      transactionOps.push(getPrisma().publicComment.create({
        data: {
          content: comment,
          ticketId: ticketId,
          authorId: user.id
        }
      }));
    }

    if (status === 'Resolved' && ticket.status === 'In Progress' && comment) {
      transactionOps.push(getPrisma().publicComment.create({
        data: {
          content: comment,
          ticketId: ticketId,
          authorId: user.id
        }
      }));
    }

    let updatedTicket = ticket;
    if (transactionOps.length > 0) {
      const results = await getPrisma().$transaction(transactionOps);
      // The first operation is the ticket update
      if (Object.keys(updateData).length > 0) {
        const firstResult = results[0];
        if (firstResult && 'summary' in firstResult) {
          updatedTicket = firstResult;
        }
      }
    }

    return res.status(200).json(updatedTicket);
  } catch (err) {
    console.error("Error updating ticket status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/staff/users", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    if (user.role === 'Requester') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const staffUsers = await getPrisma().user.findMany({
      where: { role: 'IT Staff', isActive: true },
      select: { id: true, name: true }
    });

    return res.status(200).json({ data: staffUsers });
  } catch (err) {
    console.error("Error fetching staff users:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tickets", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;

    const { search, status, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};
    if (user.role !== 'Requester') {
      return res.status(403).json({ error: "Forbidden: Only Requesters can view this list" });
    }
    whereClause.requesterId = user.id;

    if (status && status !== 'All') {
      whereClause.status = status;
    }

    if (search) {
      const searchStr = String(search).trim();
      const searchIdMatch = searchStr.match(/^TKT-0*(\d+)$/i);
      
      if (searchIdMatch) {
         whereClause.id = parseInt(searchIdMatch[1], 10);
      } else {
         whereClause.summary = { contains: searchStr, mode: 'insensitive' };
      }
    }

    const validSortFields = ['createdAt', 'priority', 'status'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    const [tickets, total] = await Promise.all([
      getPrisma().ticket.findMany({
        where: whereClause,
        include: { category: true, relatedSystem: true },
        orderBy: { [sortField]: order },
        skip,
        take: limitNum,
      }),
      getPrisma().ticket.count({ where: whereClause })
    ]);

    const data = tickets.map(t => ({
      ...t,
      ticketNumber: `TKT-${String(t.id).padStart(3, '0')}`
    }));

    return res.status(200).json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error("Error fetching tickets:", err);
    return res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

app.get("/api/tickets/:id", requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "Invalid ticket ID format" });
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: { 
        category: true, 
        relatedSystem: true,
        attachments: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Ownership check (Crucial scope rule)
    if (user.role === 'Requester' && ticket.requesterId !== user.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticketNumber = `TKT-${String(ticket.id).padStart(3, '0')}`;
    return res.status(200).json({ ...ticket, ticketNumber });

  } catch (err) {
    console.error("Error fetching single ticket:", err);
    return res.status(500).json({ error: "Failed to fetch ticket" });
  }
});



// ==========================================
// Issue #8: Communication (Comments & Notes)
// ==========================================

// GET /api/tickets/:id/comments
app.get("/api/tickets/:id/comments", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Requester non-enumeration isolation
    if (req.user!.role === 'Requester' && ticket.requesterId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const comments = await getPrisma().publicComment.findMany({
      where: { ticketId },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' }
    });

    return res.status(200).json(comments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tickets/:id/comments
app.post("/api/tickets/:id/comments", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role === 'Administrator') {
      return res.status(403).json({ error: "Administrators cannot post comments" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });

    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: "Content is required" });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: "Content must not exceed 2000 characters" });
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    if (req.user!.role === 'Requester' && ticket.requesterId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Determine if auto-transition is needed
    let newStatus = ticket.status;
    if (req.user!.role === 'Requester') {
      if (ticket.status === 'Waiting for Requester') newStatus = 'Open';
      else if (ticket.status === 'Resolved' || ticket.status === 'Closed') newStatus = 'Reopened';
    }

    const comment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.publicComment.create({
        data: {
          content: content.trim(),
          ticketId,
          authorId: req.user!.id
        },
        include: { author: { select: { id: true, name: true, role: true } } }
      });

      if (newStatus !== ticket.status) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: newStatus }
        });
      }
      return created;
    });

    return res.status(201).json(comment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tickets/:id/appears-resolved
app.post("/api/tickets/:id/appears-resolved", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'Requester') {
      return res.status(403).json({ error: "Only Requesters can use this endpoint" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.requesterId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.status !== 'In Progress') {
      return res.status(400).json({ error: "Ticket must be In Progress to use appears-resolved" });
    }

    const comment = await getPrisma().publicComment.create({
      data: {
        content: "The requester has indicated that the problem appears resolved.",
        ticketId,
        authorId: req.user!.id
      },
      include: { author: { select: { id: true, name: true, role: true } } }
    });

    return res.status(201).json(comment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tickets/:id/notes
app.get("/api/tickets/:id/notes", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role === 'Requester') {
      return res.status(403).json({ error: "Requesters cannot access internal notes" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' }
    });

    return res.status(200).json(notes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tickets/:id/notes
app.post("/api/tickets/:id/notes", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'IT Staff') {
      return res.status(403).json({ error: "Only IT Staff can post internal notes" });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket ID" });

    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: "Content is required" });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: "Content must not exceed 2000 characters" });
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const note = await getPrisma().internalNote.create({
      data: {
        content: content.trim(),
        ticketId,
        authorId: req.user!.id
      },
      include: { author: { select: { id: true, name: true, role: true } } }
    });

    return res.status(201).json(note);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



// ==========================================
// Issue #9: Administrator User Management
// ==========================================

import { NextFunction } from 'express';

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).user;
  if (user?.role !== 'Administrator') {
    return res.status(403).json({ error: 'Administrators only' });
  }
  next();
};

// GET /api/admin/users
app.get("/api/admin/users", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const { search, role } = req.query;
    const whereClause: import('@prisma/client').Prisma.UserWhereInput = {};

    if (search && typeof search === 'string') {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } }
      ];
    }
    if (role && typeof role === 'string' && role !== 'All') {
      whereClause.role = role;
    }

    const users = await getPrisma().user.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        requiresPasswordChange: true,
        createdAt: true
      }
    });

    return res.status(200).json({ data: users });
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/users
app.post("/api/admin/users", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, role, initialPassword, isActive } = req.body;

    if (!name || !email || !role || !initialPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!['Requester', 'IT Staff', 'Administrator'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existingUser = await getPrisma().user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const newUser = await getPrisma().user.create({
      data: {
        name,
        email,
        role,
        passwordHash,
        isActive: isActive !== undefined ? isActive : true,
        requiresPasswordChange: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        requiresPasswordChange: true,
        createdAt: true
      }
    });

    return res.status(201).json(newUser);
  } catch (err) {
    console.error("Error creating user:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/users/:id
app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });

    const { name, email, role, isActive } = req.body;

    const user = await getPrisma().user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (email && email !== user.email) {
      const existingUser = await getPrisma().user.findUnique({ where: { email } });
      if (existingUser) return res.status(409).json({ error: "Email already exists" });
    }

    if (role && !['Requester', 'IT Staff', 'Administrator'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const authReq = req as AuthenticatedRequest;

    // Safety: Prevent self-deactivation
    if (authReq.user!.id === id && isActive === false && user.isActive === true) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    // Safety: Prevent last admin deactivation or role change
    if ((isActive === false && user.isActive === true && user.role === 'Administrator') ||
        (role && role !== 'Administrator' && user.role === 'Administrator' && user.isActive === true)) {
      const activeAdminsCount = await getPrisma().user.count({
        where: { role: 'Administrator', isActive: true }
      });
      if (activeAdminsCount <= 1) {
        return res.status(400).json({ error: "Cannot deactivate or change role of the last active Administrator" });
      }
    }

    const updatedUser = await getPrisma().user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        requiresPasswordChange: true,
        createdAt: true
      }
    });

    return res.status(200).json(updatedUser);
  } catch (err) {
    console.error("Error updating user:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/users/:id/reset-password
app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });

    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "New password is required" });

    const user = await getPrisma().user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await getPrisma().user.update({
      where: { id },
      data: { passwordHash, requiresPasswordChange: true }
    });

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Error resetting password:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default app;

