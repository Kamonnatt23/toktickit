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

  let createdTicketIds: number[] = [];
  let createdUserIds: number[] = [];

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Staff Cat ' + Date.now() } });
    categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Staff Sys ' + Date.now() } });
    systemId = sys.id;

    const reqUser = await getPrisma().user.create({ data: { name: 'Req User', email: 'req' + Date.now() + '@test.com', role: 'Requester', requiresPasswordChange: false } });
    requesterCookie = await authService.createSession(reqUser.id);
    createdUserIds.push(reqUser.id);

    const staffUser = await getPrisma().user.create({ data: { name: 'Staff User', email: 'staff' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false } });
    staffUserId = staffUser.id;
    staffCookie = await authService.createSession(staffUser.id);
    createdUserIds.push(staffUser.id);

    const adminUser = await getPrisma().user.create({ data: { name: 'Admin User', email: 'admin' + Date.now() + '@test.com', role: 'Administrator', requiresPasswordChange: false } });
    adminCookie = await authService.createSession(adminUser.id);
    createdUserIds.push(adminUser.id);

    await getPrisma().ticket.createMany({
      data: [
        { categoryId, relatedSystemId: systemId, requesterId: reqUser.id, summary: 'Fix server', priority: 'High', itPriority: 'High', description: 'Desc', status: 'New' },
        { categoryId, relatedSystemId: systemId, requesterId: reqUser.id, summary: 'Update OS', priority: 'Medium', itPriority: 'Medium', description: 'Desc', status: 'In Progress' }
      ]
    });
    
    const tickets = await getPrisma().ticket.findMany({
      where: { requesterId: reqUser.id, categoryId, relatedSystemId: systemId }
    });
    createdTicketIds = tickets.map((t: any) => t.id);
  });

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await getPrisma().session.deleteMany({ where: { userId: { in: createdUserIds } } });
      }
      if (createdTicketIds.length > 0) {
        await getPrisma().ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
      }
      if (categoryId) {
        await getPrisma().category.deleteMany({ where: { id: categoryId } });
      }
      if (systemId) {
        await getPrisma().relatedSystem.deleteMany({ where: { id: systemId } });
      }
      if (createdUserIds.length > 0) {
        await getPrisma().user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
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
    // Test sortBy=createdAt desc (default)
    let res = await request(app).get('/api/staff/tickets?categoryId=' + categoryId + '&sortBy=createdAt&sortOrder=desc').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(new Date(res.body.data[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(res.body.data[1].createdAt).getTime());

    // Test sortBy=createdAt asc
    res = await request(app).get('/api/staff/tickets?categoryId=' + categoryId + '&sortBy=createdAt&sortOrder=asc').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(new Date(res.body.data[0].createdAt).getTime()).toBeLessThanOrEqual(new Date(res.body.data[1].createdAt).getTime());

    // Test sortBy=status asc ('In Progress' comes before 'New')
    res = await request(app).get('/api/staff/tickets?categoryId=' + categoryId + '&sortBy=status&sortOrder=asc').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('In Progress');
    expect(res.body.data[1].status).toBe('New');
  });

  it('safely ignores invalid query parameters without 400 or 500', async () => {
    const res = await request(app).get('/api/staff/tickets?sortBy=invalidField&limit=invalid&page=invalid&categoryId=invalid&ownerId=invalid').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /api/staff/users', () => {
  let staffCookie: string;
  let adminCookie: string;
  let requesterCookie: string;
  let createdUserIds: number[] = [];

  beforeAll(async () => {
    const reqUser = await getPrisma().user.create({ data: { name: 'Req User 2', email: 'req2' + Date.now() + '@test.com', role: 'Requester', requiresPasswordChange: false } });
    requesterCookie = await authService.createSession(reqUser.id);
    createdUserIds.push(reqUser.id);

    const staffUser = await getPrisma().user.create({ data: { name: 'Active Staff 2', email: 'staff2' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false, isActive: true } });
    staffCookie = await authService.createSession(staffUser.id);
    createdUserIds.push(staffUser.id);

    const inactiveStaffUser = await getPrisma().user.create({ data: { name: 'Inactive Staff', email: 'instaff' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false, isActive: false } });
    createdUserIds.push(inactiveStaffUser.id);

    const adminUser = await getPrisma().user.create({ data: { name: 'Admin User 2', email: 'admin2' + Date.now() + '@test.com', role: 'Administrator', requiresPasswordChange: false } });
    adminCookie = await authService.createSession(adminUser.id);
    createdUserIds.push(adminUser.id);
  });

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await getPrisma().session.deleteMany({ where: { userId: { in: createdUserIds } } });
        await getPrisma().user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  });

  it('denies unauthenticated access with 401', async () => {
    const res = await request(app).get('/api/staff/users');
    expect(res.status).toBe(401);
  });

  it('denies Requester access', async () => {
    const res = await request(app).get('/api/staff/users').set('Cookie', `sessionId=${requesterCookie}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/);
  });

  it('allows IT Staff and Administrator access, returning only active IT Staff', async () => {
    // IT Staff
    let res = await request(app).get('/api/staff/users').set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((u: any) => u.name === 'Active Staff 2')).toBe(true);
    expect(res.body.data.some((u: any) => u.name === 'Inactive Staff')).toBe(false);

    // Administrator
    res = await request(app).get('/api/staff/users').set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((u: any) => u.name === 'Active Staff 2')).toBe(true);
  });
});
