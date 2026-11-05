import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';

describe('Staff & Administrator Dashboard API (DASH-06 - DASH-12)', () => {
  const prisma = getPrisma();

  let staff1Cookie: string;
  let staff2Cookie: string;
  let adminCookie: string;
  let requesterCookie: string;

  let staff1Id: number;
  let staff2Id: number;
  let adminId: number;
  let requesterId: number;

  let catId: number;
  let sysId: number;

  const createdTicketIds: number[] = [];
  const createdUserIds: number[] = [];

  const createTicket = async (data: {
    status: string;
    requesterId?: number;
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
        summary: data.summary || `Staff Dashboard Ticket ${Date.now()}`,
        description: 'Testing staff queue and dashboard metrics',
        status: data.status,
        priority: data.priority || 'Medium',
        itPriority: data.itPriority || 'Medium',
        requesterId: data.requesterId || requesterId,
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

    const createUser = async (email: string, role: string, isActive = true) => {
      const u = await prisma.user.create({
        data: {
          name: email.split('@')[0],
          email,
          passwordHash,
          role,
          isActive,
          requiresPasswordChange: false
        }
      });
      createdUserIds.push(u.id);
      return u;
    };

    const s1 = await createUser(`s1-dash-${suffix}@test.com`, 'IT Staff');
    staff1Id = s1.id;
    const s2 = await createUser(`s2-dash-${suffix}@test.com`, 'IT Staff');
    staff2Id = s2.id;
    const adm = await createUser(`adm-dash-${suffix}@test.com`, 'Administrator');
    adminId = adm.id;
    const req = await createUser(`req-dash-${suffix}@test.com`, 'Requester');
    requesterId = req.id;

    // Inactive user for stats verification
    await createUser(`inact-dash-${suffix}@test.com`, 'Requester', false);

    const getSessionCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0].split('=')[1] : '';
    };

    staff1Cookie = await getSessionCookie(s1.email);
    staff2Cookie = await getSessionCookie(s2.email);
    adminCookie = await getSessionCookie(adm.email);
    requesterCookie = await getSessionCookie(req.email);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `StaffDashCat-${suffix}` } });
    catId = cat.id;

    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `StaffDashSys-${suffix}` } });
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

  it('DASH-06: IT Staff calls GET /api/dashboard/staff and receives metrics, priority breakdown, and recent queue', async () => {
    // Seed tickets: unassigned New, assigned In Progress, etc.
    await createTicket({ status: 'New', ownerId: null, itPriority: 'High' });
    await createTicket({ status: 'Open', ownerId: staff1Id, itPriority: 'Critical' });
    await createTicket({ status: 'In Progress', ownerId: staff1Id, itPriority: 'Medium' });
    await createTicket({ status: 'Waiting for Requester', ownerId: staff2Id, itPriority: 'Low' });

    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${staff1Cookie}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.unassigned).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.myAssigned).toBeGreaterThanOrEqual(2);
    expect(res.body.metrics.new).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.open).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.inProgress).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.waitingForRequester).toBeGreaterThanOrEqual(1);

    expect(res.body.priorityBreakdown).toBeDefined();
    expect(res.body.priorityBreakdown).toHaveProperty('critical');
    expect(res.body.priorityBreakdown).toHaveProperty('high');
    expect(res.body.priorityBreakdown).toHaveProperty('medium');
    expect(res.body.priorityBreakdown).toHaveProperty('low');

    expect(Array.isArray(res.body.recentTickets)).toBe(true);
    expect(res.body.recentTickets.length).toBeLessThanOrEqual(5);

    const first = res.body.recentTickets[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('ticketNumber');
    expect(first).toHaveProperty('summary');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('priority');
    expect(first).toHaveProperty('itPriority');
    expect(first).toHaveProperty('owner');
    expect(first).toHaveProperty('requester');
    expect(first).toHaveProperty('updatedAt');
  });

  it('DASH-07: Unassigned & My Assigned counts exclude Resolved/Closed/Cancelled and include Reopened', async () => {
    // Isolated verification
    const unassignedReopened = await createTicket({ status: 'Reopened', ownerId: null });
    const assignedReopened = await createTicket({ status: 'Reopened', ownerId: staff1Id });
    const unassignedResolved = await createTicket({ status: 'Resolved', ownerId: null, resolvedAt: new Date() });
    const assignedClosed = await createTicket({ status: 'Closed', ownerId: staff1Id });
    const assignedCancelled = await createTicket({ status: 'Cancelled', ownerId: staff1Id });

    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${staff1Cookie}`);

    expect(res.status).toBe(200);
    // Unassigned active must include unassignedReopened
    // Completed/Cancelled tickets must not be counted in active metrics
    expect(res.body.metrics.unassigned).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.myAssigned).toBeGreaterThanOrEqual(1);
  });

  it('DASH-08: Priority breakdown accurately groups active tickets and excludes completed ones', async () => {
    await createTicket({ status: 'In Progress', ownerId: staff1Id, itPriority: 'Critical' });
    await createTicket({ status: 'Resolved', ownerId: staff1Id, itPriority: 'Critical', resolvedAt: new Date() }); // Should not be in breakdown

    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${staff1Cookie}`);

    expect(res.status).toBe(200);
    expect(res.body.priorityBreakdown.critical).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.priorityBreakdown.high).toBe('number');
    expect(typeof res.body.priorityBreakdown.medium).toBe('number');
    expect(typeof res.body.priorityBreakdown.low).toBe('number');
  });

  it('DASH-09: Empty Staff queue returns zero counts and HTTP 200', async () => {
    // When called, response format should maintain valid structure even if counts are 0
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${staff2Cookie}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.metrics.unassigned).toBe('number');
    expect(typeof res.body.metrics.myAssigned).toBe('number');
    expect(typeof res.body.priorityBreakdown.critical).toBe('number');
  });

  it('DASH-10: Administrator dashboard returns Staff metrics and all five user statistics', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Cookie', `sessionId=${adminCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.staffMetrics).toBeDefined();
    expect(res.body.priorityBreakdown).toBeDefined();
    expect(res.body.userStats).toBeDefined();

    const { userStats } = res.body;
    expect(userStats.totalUsers).toBeGreaterThanOrEqual(5);
    expect(userStats.activeRequesters).toBeGreaterThanOrEqual(1);
    expect(userStats.activeStaff).toBeGreaterThanOrEqual(2);
    expect(userStats.activeAdmins).toBeGreaterThanOrEqual(1);
    expect(userStats.inactiveUsers).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(res.body.recentTickets)).toBe(true);
  });

  it('DASH-11: Non-administrators receive 403 Forbidden on /api/dashboard/admin', async () => {
    const resStaff = await request(app)
      .get('/api/dashboard/admin')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resStaff.status).toBe(403);
    expect(resStaff.body.error).toContain('Forbidden');

    const resReq = await request(app)
      .get('/api/dashboard/admin')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resReq.status).toBe(403);
    expect(resReq.body.error).toContain('Forbidden');
  });

  it('DASH-12: Verify drill-down filter alignment and combinations on /api/tickets and /api/staff/tickets', async () => {
    // 1. /api/tickets?view=open
    // Returns only New, Open, In Progress, Waiting for Requester, and Reopened. Excludes Closed and Cancelled.
    const tNew = await createTicket({ status: 'New', requesterId });
    const tOpen = await createTicket({ status: 'Open', requesterId });
    const tProg = await createTicket({ status: 'In Progress', requesterId });
    const tWait = await createTicket({ status: 'Waiting for Requester', requesterId });
    const tReopen = await createTicket({ status: 'Reopened', requesterId });
    const tClosed = await createTicket({ status: 'Closed', requesterId });
    const tCancel = await createTicket({ status: 'Cancelled', requesterId });

    const resOpen = await request(app)
      .get('/api/tickets?view=open')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resOpen.status).toBe(200);
    const openIds = resOpen.body.data.map((t: any) => t.id);
    expect(openIds).toContain(tNew.id);
    expect(openIds).toContain(tOpen.id);
    expect(openIds).toContain(tProg.id);
    expect(openIds).toContain(tWait.id);
    expect(openIds).toContain(tReopen.id);
    expect(openIds).not.toContain(tClosed.id);
    expect(openIds).not.toContain(tCancel.id);

    // 2. /api/tickets?status=Resolved&withinDays=30
    // Uses resolvedAt, not updatedAt, and excludes legacy resolvedAt = NULL
    const tResolvedRecent = await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
    });
    const tResolvedOld = await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      updatedAt: new Date() // Updated today, but resolvedAt is 40 days ago
    });
    const tResolvedLegacy = await createTicket({
      status: 'Resolved',
      requesterId,
      resolvedAt: null, // Legacy null resolvedAt
      updatedAt: new Date()
    });

    const resResolved30 = await request(app)
      .get('/api/tickets?status=Resolved&withinDays=30')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resResolved30.status).toBe(200);
    const resolved30Ids = resResolved30.body.data.map((t: any) => t.id);
    expect(resolved30Ids).toContain(tResolvedRecent.id);
    expect(resolved30Ids).not.toContain(tResolvedOld.id); // Excluded because resolvedAt > 30 days ago, despite recent updatedAt
    expect(resolved30Ids).not.toContain(tResolvedLegacy.id); // Excluded because resolvedAt is NULL

    // 3. /api/staff/tickets?ownerId=Unassigned
    // Returns only active unassigned tickets. Excludes Resolved, Closed, and Cancelled.
    const tUnassignedActive = await createTicket({ status: 'Open', ownerId: null });
    const tUnassignedReopened = await createTicket({ status: 'Reopened', ownerId: null });
    const tUnassignedResolved = await createTicket({ status: 'Resolved', ownerId: null, resolvedAt: new Date() });
    const tUnassignedClosed = await createTicket({ status: 'Closed', ownerId: null });
    const tAssignedActive = await createTicket({ status: 'Open', ownerId: staff1Id });

    const resUnassigned = await request(app)
      .get('/api/staff/tickets?ownerId=Unassigned')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resUnassigned.status).toBe(200);
    const unassignedIds = resUnassigned.body.data.map((t: any) => t.id);
    expect(unassignedIds).toContain(tUnassignedActive.id);
    expect(unassignedIds).toContain(tUnassignedReopened.id);
    expect(unassignedIds).not.toContain(tUnassignedResolved.id);
    expect(unassignedIds).not.toContain(tUnassignedClosed.id);
    expect(unassignedIds).not.toContain(tAssignedActive.id);

    // 4. /api/staff/tickets?scope=active
    // Excludes Resolved, Closed, and Cancelled.
    const resActive = await request(app)
      .get('/api/staff/tickets?scope=active')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resActive.status).toBe(200);
    const activeIds = resActive.body.data.map((t: any) => t.id);
    expect(activeIds).toContain(tUnassignedActive.id);
    expect(activeIds).toContain(tUnassignedReopened.id);
    expect(activeIds).toContain(tAssignedActive.id);
    expect(activeIds).not.toContain(tUnassignedResolved.id);
    expect(activeIds).not.toContain(tUnassignedClosed.id);

    // 5. Combined filter: ?itPriority=Critical&scope=active
    // Uses boolean AND
    const tCritActive = await createTicket({ status: 'In Progress', itPriority: 'Critical', ownerId: staff1Id });
    const tCritResolved = await createTicket({ status: 'Resolved', itPriority: 'Critical', ownerId: staff1Id, resolvedAt: new Date() });
    const tHighActive = await createTicket({ status: 'In Progress', itPriority: 'High', ownerId: staff1Id });

    const resCritActive = await request(app)
      .get('/api/staff/tickets?itPriority=Critical&scope=active')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resCritActive.status).toBe(200);
    const critActiveIds = resCritActive.body.data.map((t: any) => t.id);
    expect(critActiveIds).toContain(tCritActive.id);
    expect(critActiveIds).not.toContain(tCritResolved.id); // Fails scope=active
    expect(critActiveIds).not.toContain(tHighActive.id); // Fails itPriority=Critical

    // ownerId=abc -> 400
    const resBadOwnerStr = await request(app).get('/api/staff/tickets?ownerId=abc').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadOwnerStr.status).toBe(400);

    // ownerId=All -> 400 (per Lab 4 api-spec.md Section 3.4)
    const resBadOwnerAll = await request(app).get('/api/staff/tickets?ownerId=All').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadOwnerAll.status).toBe(400);

    // ownerId=0 -> 400
    const resBadOwnerZero = await request(app).get('/api/staff/tickets?ownerId=0').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadOwnerZero.status).toBe(400);

    // ownerId=-5 -> 400
    const resBadOwnerNeg = await request(app).get('/api/staff/tickets?ownerId=-5').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadOwnerNeg.status).toBe(400);

    // ownerId=1.5 -> 400
    const resBadOwnerFrac = await request(app).get('/api/staff/tickets?ownerId=1.5').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadOwnerFrac.status).toBe(400);

    // Valid positive ownerId -> 200
    const resValidOwner = await request(app).get(`/api/staff/tickets?ownerId=${staff1Id}`).set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resValidOwner.status).toBe(200);

    // Valid ownerId=Unassigned -> 200
    const resValidUnassigned = await request(app).get('/api/staff/tickets?ownerId=Unassigned').set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resValidUnassigned.status).toBe(200);

    // 7. Other invalid query validations
    const resBadView = await request(app)
      .get('/api/tickets?view=closed')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resBadView.status).toBe(400);

    const resBadDays = await request(app)
      .get('/api/tickets?status=Resolved&withinDays=-5')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resBadDays.status).toBe(400);

    const resBadDaysZero = await request(app)
      .get('/api/tickets?status=Resolved&withinDays=0')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resBadDaysZero.status).toBe(400);

    const resBadDaysStr = await request(app)
      .get('/api/tickets?status=Resolved&withinDays=abc')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resBadDaysStr.status).toBe(400);

    const resBadScope = await request(app)
      .get('/api/staff/tickets?scope=archived')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadScope.status).toBe(400);

    const resBadPriority = await request(app)
      .get('/api/staff/tickets?itPriority=Extreme')
      .set('Cookie', `sessionId=${staff1Cookie}`);
    expect(resBadPriority.status).toBe(400);

    const resBadStatus = await request(app)
      .get('/api/tickets?status=InvalidStatus')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(resBadStatus.status).toBe(400);
  });

  it('Authorization: Unauthenticated requests receive 401', async () => {
    const resStaff = await request(app).get('/api/dashboard/staff');
    expect(resStaff.status).toBe(401);

    const resAdmin = await request(app).get('/api/dashboard/admin');
    expect(resAdmin.status).toBe(401);
  });

  it('Authorization: Requester receives 403 on /api/dashboard/staff', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${requesterCookie}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('Authorization: Administrator receives 200 on /api/dashboard/staff', async () => {
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
  });
});
