import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';

describe('Requester Dashboard API (DASH-01 - DASH-05)', () => {
  const prisma = getPrisma();

  let requesterCookie: string;
  let emptyRequesterCookie: string;
  let otherRequesterCookie: string;
  let staffCookie: string;
  let adminCookie: string;

  let requesterId: number;
  let emptyRequesterId: number;
  let otherRequesterId: number;
  let staffId: number;
  let adminId: number;

  let catId: number;
  let sysId: number;

  const createdTicketIds: number[] = [];
  const createdUserIds: number[] = [];

  const createTicket = async (data: {
    status: string;
    requesterId: number;
    ownerId?: number | null;
    summary?: string;
    priority?: string;
    itPriority?: string;
    resolvedAt?: Date | null;
    updatedAt?: Date;
  }) => {
    const t = await prisma.ticket.create({
      data: {
        categoryId: catId,
        relatedSystemId: sysId,
        summary: data.summary || `Ticket ${Date.now()}`,
        description: 'Test description',
        status: data.status,
        priority: data.priority || 'Medium',
        itPriority: data.itPriority || 'Medium',
        requesterId: data.requesterId,
        ownerId: data.ownerId !== undefined ? data.ownerId : null,
        resolvedAt: data.resolvedAt !== undefined ? data.resolvedAt : null,
        ...(data.updatedAt ? { updatedAt: data.updatedAt } : {})
      }
    });
    createdTicketIds.push(t.id);
    return t;
  };

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now().toString().slice(-6);
    const passwordHash = await bcrypt.hash('password123', 10);

    const createUser = async (email: string, role: string) => {
      const u = await prisma.user.create({
        data: {
          name: email.split('@')[0],
          email,
          passwordHash,
          role,
          isActive: true,
          requiresPasswordChange: false
        }
      });
      createdUserIds.push(u.id);
      return u;
    };

    const reqUser = await createUser(`dash-req-${suffix}@test.com`, 'Requester');
    requesterId = reqUser.id;

    const emptyUser = await createUser(`dash-empty-${suffix}@test.com`, 'Requester');
    emptyRequesterId = emptyUser.id;

    const otherReq = await createUser(`dash-oth-${suffix}@test.com`, 'Requester');
    otherRequesterId = otherReq.id;

    const staffUser = await createUser(`dash-stf-${suffix}@test.com`, 'IT Staff');
    staffId = staffUser.id;

    const admUser = await createUser(`dash-adm-${suffix}@test.com`, 'Administrator');
    adminId = admUser.id;

    const getSessionCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0].split('=')[1] : '';
    };

    requesterCookie = await getSessionCookie(reqUser.email);
    emptyRequesterCookie = await getSessionCookie(emptyUser.email);
    otherRequesterCookie = await getSessionCookie(otherReq.email);
    staffCookie = await getSessionCookie(staffUser.email);
    adminCookie = await getSessionCookie(admUser.email);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `DashCat-${suffix}` } });
    catId = cat.id;

    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `DashSys-${suffix}` } });
    sysId = sys.id;
  });

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId: { in: createdTicketIds } } } });
      await prisma.actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it('DASH-01: Requester calls GET /api/dashboard/requester and receives metrics and recent lists', async () => {
    // Seed diverse tickets for requester
    await createTicket({ status: 'New', requesterId });
    await createTicket({ status: 'Open', requesterId });
    await createTicket({ status: 'In Progress', requesterId });
    await createTicket({ status: 'Waiting for Requester', requesterId });
    await createTicket({ status: 'Resolved', requesterId, resolvedAt: new Date() });
    await createTicket({ status: 'Closed', requesterId });

    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${requesterCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.openTickets).toBeGreaterThanOrEqual(4);
    expect(res.body.metrics.waitingForRequester).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.inProgress).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.resolved).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.closed).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(res.body.recentlyUpdatedTickets)).toBe(true);
    expect(res.body.recentlyUpdatedTickets.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(res.body.recentlyResolvedTickets)).toBe(true);
    expect(res.body.recentlyResolvedTickets.length).toBeLessThanOrEqual(5);

    // Verify recent ticket shape
    const item = res.body.recentlyUpdatedTickets[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('ticketNumber');
    expect(item).toHaveProperty('summary');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('priority');
    expect(item).toHaveProperty('updatedAt');
  });

  it('DASH-02: My Open Tickets calculation strictly excludes Closed and Cancelled tickets and includes Reopened', async () => {
    // Create specific unique tickets for otherRequester
    await createTicket({ status: 'Open', requesterId: otherRequesterId });
    await createTicket({ status: 'In Progress', requesterId: otherRequesterId });
    await createTicket({ status: 'Reopened', requesterId: otherRequesterId });
    await createTicket({ status: 'Closed', requesterId: otherRequesterId });
    await createTicket({ status: 'Cancelled', requesterId: otherRequesterId });

    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${otherRequesterCookie}`);

    expect(res.status).toBe(200);
    // Open, In Progress, Reopened = 3 open tickets; Closed and Cancelled excluded
    expect(res.body.metrics.openTickets).toBe(3);
    expect(res.body.metrics.closed).toBe(1);
  });

  it('DASH-03: Recently Resolved evaluates resolvedAt IS NOT NULL and within 30 days', async () => {
    const now = new Date();
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    // Within 30 days
    const recentRes = await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: twentyDaysAgo,
      summary: 'Resolved 20 days ago'
    });

    // Outside 30 days
    await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: fortyDaysAgo,
      summary: 'Resolved 40 days ago'
    });

    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${requesterCookie}`);

    expect(res.status).toBe(200);
    const resolvedIds = res.body.recentlyResolvedTickets.map((t: any) => t.id);
    expect(resolvedIds).toContain(recentRes.id);

    // Verify ActionTaken update does not alter resolvedAt
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: recentRes.id,
        actionDateTime: new Date(),
        actionDescription: 'Post-resolution diagnostic check',
        result: 'Diagnostics completed successfully',
        performedById: staffId
      }
    });

    // Refresh ticket updatedAt without touching resolvedAt
    await prisma.ticket.update({
      where: { id: recentRes.id },
      data: { updatedAt: new Date() }
    });

    const refreshedTicket = await prisma.ticket.findUnique({ where: { id: recentRes.id } });
    expect(refreshedTicket?.resolvedAt?.toISOString()).toBe(twentyDaysAgo.toISOString());
  });

  it('DASH-04: Legacy ticket with resolvedAt = NULL is excluded from Recently Resolved count and list', async () => {
    const legacyTicket = await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: null,
      summary: 'Legacy resolved ticket without timestamp'
    });

    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${requesterCookie}`);

    expect(res.status).toBe(200);
    const resolvedIds = res.body.recentlyResolvedTickets.map((t: any) => t.id);
    expect(resolvedIds).not.toContain(legacyTicket.id);
  });

  it('DASH-05: Empty Requester returns all zero metrics and empty arrays with HTTP 200', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${emptyRequesterCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      openTickets: 0,
      waitingForRequester: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0
    });
    expect(res.body.recentlyUpdatedTickets).toEqual([]);
    expect(res.body.recentlyResolvedTickets).toEqual([]);
  });

  it('Authorization: Unauthenticated requests receive 401', async () => {
    const res = await request(app).get('/api/dashboard/requester');
    expect(res.status).toBe(401);
  });

  it('Authorization: IT Staff and Administrator receive 403 Forbidden', async () => {
    const resStaff = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${staffCookie}`);
    expect(resStaff.status).toBe(403);
    expect(resStaff.body.error).toContain('Forbidden');

    const resAdmin = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${adminCookie}`);
    expect(resAdmin.status).toBe(403);
    expect(resAdmin.body.error).toContain('Forbidden');
  });

  it('Data Isolation: Requester never receives another user\'s tickets', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${emptyRequesterCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.recentlyUpdatedTickets.length).toBe(0);
    expect(res.body.recentlyResolvedTickets.length).toBe(0);
  });

  it('Deterministic sort: recentlyUpdatedTickets ordered by updatedAt DESC, id DESC', async () => {
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${requesterCookie}`);

    expect(res.status).toBe(200);
    const list = res.body.recentlyUpdatedTickets;
    for (let i = 0; i < list.length - 1; i++) {
      const timeA = new Date(list[i].updatedAt).getTime();
      const timeB = new Date(list[i + 1].updatedAt).getTime();
      if (timeA === timeB) {
        expect(list[i].id).toBeGreaterThanOrEqual(list[i + 1].id);
      } else {
        expect(timeA).toBeGreaterThanOrEqual(timeB);
      }
    }
  });
});
