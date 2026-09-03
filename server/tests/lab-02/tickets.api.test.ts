import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("Ticket APIs (Issue 3)", () => {
  let requesterId: number;
  let categoryId: number;
  let systemId: number;

  beforeEach(async () => {
    // Make sure we have some seed data for tests
    const req = await getPrisma().requesterUser.findFirst();
    if (req) requesterId = req.id;
    
    const cat = await getPrisma().category.findFirst();
    if (cat) categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.findFirst();
    if (sys) systemId = sys.id;
  });

  afterEach(async () => {
    // Clean up created tickets
    await getPrisma().ticket.deleteMany();
  });

  it("POST /api/tickets successfully creates a ticket", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .send({
        categoryId,
        relatedSystemId: systemId,
        summary: "Test issue",
        priority: "High",
        description: "Test description"
      });
      
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.summary).toBe("Test issue");
    expect(res.body.requesterId).toBe(requesterId);
  });

  it("POST /api/tickets validates missing header", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({
        categoryId,
        relatedSystemId: systemId,
        summary: "Test issue",
        priority: "High",
        description: "Test description"
      });
      
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing X-Requester-Id/);
  });

  it("POST /api/tickets validates missing payload fields", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .send({
        // missing categoryId and others
        summary: "Test"
      });
      
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/);
  });
});
