import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    
    const names = res.body.map((c: any) => c.name);
    expect(names).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network"
    ]);
  });
});
