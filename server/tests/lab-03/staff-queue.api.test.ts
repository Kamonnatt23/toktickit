import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { authService } from '../../src/services/auth.service.js';

describe('GET /api/staff/tickets', () => {
  let staffCookie: string;
  let adminCookie: string;
  let requesterCookie: string;
  let categoryId: number;
  let systemId: number;
  let staffUserId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Staff Cat ' + Date.now() } });
    categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Staff Sys ' + Date.now() } });
    systemId = sys.id;

    const reqUser = await getPrisma().user.create({ data: { name: 'Req User', email: 'req' + Date.now() + '@test.com', role: 'Requester', requiresPasswordChange: false } });
    requesterCookie = await authService.createSession(reqUser.id);

    const staffUser = await getPrisma().user.create({ data: { name: 'Staff User', email: 'staff' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false } });
    staffUserId = staffUser.id;
    staffCookie = await authService.createSession(staffUser.id);

    const adminUser = await getPrisma().user.create({ data: { name: 'Admin User', email: 'admin' + Date.now() + '@test.com', role: 'Administrator', requiresPasswordChange: false } });
    adminCookie = await authService.createSession(adminUser.id);

    await getPrisma().ticket.createMany({
      data: [
        { categoryId, relatedSystemId: systemId, requesterId: reqUser.id, summary: 'Fix server', priority: 'High', itPriority: 'High', description: 'Desc', status: 'New' },
        { categoryId, relatedSystemId: systemId, requesterId: reqUser.id, summary: 'Update OS', priority: 'Medium', itPriority: 'Medium', description: 'Desc', status: 'In Progress' }
      ]
    });
  });

  it('denies unauthenticated access with 401', async () => {
    const res = await request(app).get('/api/staff/tickets');
    expect(res.status).toBe(401);
  });

  it('denies Requester access', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', `sessionId=${requesterCookie}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/);
  });

  it('allows IT Staff access', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('ticketNumber');
    expect(res.body.data[0].requester).toHaveProperty('name');
  });

  it('allows Administrator access', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/staff/tickets?status=In Progress').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    const hasNew = res.body.data.some((t: any) => t.status === 'New');
    expect(hasNew).toBe(false);
  });

  it('filters by categoryId', async () => {
    const res = await request(app).get(`/api/staff/tickets?categoryId=${categoryId}`).set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('searches by summary', async () => {
    const res = await request(app).get('/api/staff/tickets?search=server').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    const summaries = res.body.data.map((t: any) => t.summary.toLowerCase());
    expect(summaries.some((s: string) => s.includes('server'))).toBe(true);
  });

  it('filters by ownerId', async () => {
    const tickets = await getPrisma().ticket.findMany({ where: { summary: 'Update OS' } });
    if (tickets.length > 0) {
      await getPrisma().ticket.update({ where: { id: tickets[0].id }, data: { ownerId: staffUserId } });
    }

    const res = await request(app).get(`/api/staff/tickets?ownerId=${staffUserId}`).set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t: any) => t.ownerId === staffUserId)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('handles pagination (page and limit)', async () => {
    const res = await request(app).get('/api/staff/tickets?page=1&limit=1').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
    });
  });

  it('handles sorting (sortBy and sortOrder)', async () => {
    const res = await request(app).get('/api/staff/tickets?sortBy=status&sortOrder=asc').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('safely ignores invalid query parameters without 400 or 500', async () => {
    const res = await request(app).get('/api/staff/tickets?sortBy=invalidField&limit=invalid&page=invalid&categoryId=invalid&ownerId=invalid').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.data).toBeDefined();
  });
});
