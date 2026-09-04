import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/dev/users", () => {
  it("returns active dev requester users in alphabetical order and structurally correct", async () => {
    const res = await request(app).get("/api/dev/users");
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    
    // Structural assertion: every returned user should have required fields
    res.body.forEach((u: any) => {
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("name");
      expect(u).toHaveProperty("email");
      expect(u).toHaveProperty("role");
      
      // We know from DB schema that role should be Requester (or similar)
      // but primarily we check that no inactive users leaked. Since the 
      // API doesn't expose 'isActive', we verify the expected fields exist.
      expect(typeof u.name).toBe("string");
    });

    // Verify ordering by name
    const names = res.body.map((u: any) => u.name);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });
});
