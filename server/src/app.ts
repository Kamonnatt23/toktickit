import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import attachmentsRouter from "./attachments.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

app.use("/api/attachments", attachmentsRouter);

app.get("/", (_req: Request, res: Response) => {
  res.send("TokTickIT API is running! Access /api/health to check status.");
});

// ---------------------------------------------------------------------------
// Issue 2 — API health check
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
    const users = await getPrisma().requesterUser.findMany({
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

app.post("/api/tickets", async (req: Request, res: Response): Promise<any> => {
  try {
    const requesterIdStr = req.header("X-Requester-Id");
    if (!requesterIdStr) {
      return res.status(401).json({ error: "Unauthorized: Missing X-Requester-Id header" });
    }
    
    const requesterId = parseInt(requesterIdStr, 10);
    if (isNaN(requesterId)) {
      return res.status(401).json({ error: "Unauthorized: Invalid X-Requester-Id header" });
    }

    const requester = await getPrisma().requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(401).json({ error: "Unauthorized: Requester not found or inactive" });
    }

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

app.get("/api/tickets", async (req: Request, res: Response): Promise<any> => {
  try {
    const requesterIdStr = req.header("X-Requester-Id");
    if (!requesterIdStr) return res.status(401).json({ error: "Missing X-Requester-Id header" });
    const requesterId = parseInt(requesterIdStr, 10);
    if (isNaN(requesterId)) return res.status(401).json({ error: "Invalid X-Requester-Id header" });

    const requester = await getPrisma().requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(401).json({ error: "Unauthorized: Requester not found or inactive" });
    }

    const { search, status, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = { requesterId };

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

app.get("/api/tickets/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const requesterIdStr = req.header("X-Requester-Id");
    if (!requesterIdStr) return res.status(401).json({ error: "Missing X-Requester-Id header" });
    
    const requesterId = parseInt(requesterIdStr, 10);
    if (isNaN(requesterId)) return res.status(401).json({ error: "Invalid X-Requester-Id header" });

    const requester = await getPrisma().requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(401).json({ error: "Unauthorized: Requester not found or inactive" });
    }
    
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
    if (ticket.requesterId !== requesterId) {
      // Returning 404 for security obscurity or 403. Using 404 is generally better for obscurity, 
      // but standard is 403. Let's return 403 as the prompt says "403 Forbidden (or 404 Not Found)"
      return res.status(403).json({ error: "Forbidden: You do not have permission to access this ticket" });
    }

    const ticketNumber = `TKT-${String(ticket.id).padStart(3, '0')}`;
    return res.status(200).json({ ...ticket, ticketNumber });

  } catch (err) {
    console.error("Error fetching single ticket:", err);
    return res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

export default app;
