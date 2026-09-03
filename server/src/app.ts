import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

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

    const { categoryId, relatedSystemId, summary, priority, description } = req.body;
    
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

    const ticket = await getPrisma().ticket.create({
      data: {
        categoryId: parseInt(categoryId, 10),
        relatedSystemId: parseInt(relatedSystemId, 10),
        summary: trimmedSummary,
        priority,
        description: trimmedDescription,
        requesterId,
      }
    });

    const ticketNumber = `TKT-${String(ticket.id).padStart(3, '0')}`;

    return res.status(201).json({ ...ticket, ticketNumber });
  } catch (err) {
    console.error("Error creating ticket:", err);
    return res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default app;
