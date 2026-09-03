import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/dev/users", () => {
  it("returns active dev requester users in alphabetical order", async () => {
    const res = await request(app).get("/api/dev/users");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    // Based on the seed, there should be 4 active users
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    
    // Check if 'Inactive User' is NOT in the list
    const hasInactive = res.body.some((u: any) => u.name === "Inactive User");
    expect(hasInactive).toBe(false);

    // Verify ordering by name
    const names = res.body.map((u: any) => u.name);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });
});
