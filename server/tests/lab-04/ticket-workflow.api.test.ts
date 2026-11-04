import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

describe('Ticket Workflow & Resolution Rules API (Lab 4)', () => {
  const prisma = getPrisma();

  let requesterCookie: string;
  let otherRequesterCookie: string;
  let staff1Cookie: string;
  let adminCookie: string;

  let requesterId: number;
  let otherRequesterId: number;
  let staff1Id: number;
  let adminId: number;

  let catId: number;
  let sysId: number;

  const createTicket = async (status: string, ownerId: number | null, customReqId?: number) => {
    return await prisma.ticket.create({
      data: {
        categoryId: catId,
        relatedSystemId: sysId,
        summary: `Workflow Test Ticket ${Date.now()}`,
        description: 'Testing lifecycle transitions',
        priority: 'High',
        itPriority: 'High',
        status,
        requesterId: customReqId || requesterId,
        ownerId,
        resolvedAt: status === 'Resolved' || status === 'Closed' ? new Date() : null
      }
    });
  };

  const logAction = async (ticketId: number, performedById: number) => {
    return await prisma.actionTaken.create({
      data: {
        ticketId,
        actionDateTime: new Date(),
        actionDescription: 'Verified network switch connectivity',
        result: 'Port link restored',
        performedById,
        followUpRequired: false
      }
    });
  };

  beforeAll(async () => {
    await prisma.$connect();

    const passwordHash = await bcrypt.hash('password123', 10);
    const suffix = Date.now().toString().slice(-6);

    const createTestUser = async (email: string, role: string) => {
      return await prisma.user.create({
        data: {
          name: email.split('@')[0],
          email,
          passwordHash,
          role,
          isActive: true,
          requiresPasswordChange: false
        }
      });
    };

    const reqUser = await createTestUser(`req-wf-${suffix}@test.com`, 'Requester');
    requesterId = reqUser.id;
    const otherReq = await createTestUser(`other-wf-${suffix}@test.com`, 'Requester');
    otherRequesterId = otherReq.id;
    const s1 = await createTestUser(`staff-wf-${suffix}@test.com`, 'IT Staff');
    staff1Id = s1.id;
    const adm = await createTestUser(`admin-wf-${suffix}@test.com`, 'Administrator');
    adminId = adm.id;

    const getCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    };

    requesterCookie = await getCookie(`req-wf-${suffix}@test.com`);
    otherRequesterCookie = await getCookie(`other-wf-${suffix}@test.com`);
    staff1Cookie = await getCookie(`staff-wf-${suffix}@test.com`);
    adminCookie = await getCookie(`admin-wf-${suffix}@test.com`);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `Cat-${suffix}` } });
    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `Sys-${suffix}` } });
    catId = cat.id;
    sysId = sys.id;
  });

  describe('Permitted Status Transitions & Owner Enforcement (WF-01..16)', () => {
    it('WF-01: Transition New -> Open with assigned owner succeeds', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Open');
    });

    it('WF-02: Transition New -> Open without assigned owner is rejected', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Ticket must be assigned to an owner before transitioning from 'New' to 'Open'.");
    });

    it('WF-03: Transition New -> Cancelled with required cancellation reason', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          status: 'Cancelled',
          reason: 'Duplicate ticket submitted by mistake',
          lastUpdatedAt: ticket.updatedAt.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Cancelled');

      const notes = await prisma.internalNote.findMany({ where: { ticketId: ticket.id } });
      expect(notes.length).toBe(1);
      expect(notes[0].content).toContain('Duplicate ticket submitted by mistake');
    });

    it('WF-04: Transition New -> Cancelled with empty or missing reason is rejected', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Cancelled', reason: '   ', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cancellation reason is required');
    });

    it('WF-05: Transition Open -> In Progress with assigned owner succeeds', async () => {
      const ticket = await createTicket('Open', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('In Progress');
    });

    it('WF-06: Transition Open -> In Progress without assigned owner is rejected', async () => {
      const ticket = await createTicket('Open', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Ticket must be assigned to an owner before transitioning from 'Open' to 'In Progress'.");
    });

    it('WF-07: Transition Open / In Progress -> Waiting for Requester with public comment', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          status: 'Waiting for Requester',
          comment: 'Please verify if the error still occurs after clearing browser cache',
          lastUpdatedAt: ticket.updatedAt.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Waiting for Requester');

      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
      expect(comments[0].content).toContain('Please verify if the error still occurs');
    });

    it('WF-08: Transition Open / In Progress -> Waiting for Requester without comment is rejected', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Waiting for Requester', comment: '', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Public comment is required');
    });

    it('WF-09: Transition In Progress -> Resolved with 0 Actions Taken is blocked by Resolution Gate', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('At least one action taken must be recorded before resolving the ticket.');
    });

    it('WF-10: Transition In Progress -> Resolved with >= 1 Action Taken and optional comment succeeds', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      await logAction(ticket.id, staff1Id);

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          status: 'Resolved',
          comment: 'Replaced cable and verified signal strength.',
          lastUpdatedAt: ticket.updatedAt.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Resolved');
      expect(res.body.resolvedAt).not.toBeNull();

      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe('Replaced cable and verified signal strength.');
    });

    it('WF-10b: Transition In Progress -> Resolved with >= 1 Action Taken and missing/blank comment succeeds without comment', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      await logAction(ticket.id, staff1Id);

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Resolved');
      expect(res.body.resolvedAt).not.toBeNull();

      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);
    });

    it('WF-11: Transition Resolved -> Closed preserves resolvedAt; Administrator is rejected with 403', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      await logAction(ticket.id, staff1Id);

      // Resolve first
      const resolveRes = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(resolveRes.status).toBe(200);
      const originalResolvedAt = resolveRes.body.resolvedAt;

      // Administrator attempts Closed -> 403 Forbidden
      const adminRes = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({ status: 'Closed', lastUpdatedAt: resolveRes.body.updatedAt });
      expect(adminRes.status).toBe(403);

      // IT Staff closes ticket
      const closeRes = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Closed', lastUpdatedAt: resolveRes.body.updatedAt });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.status).toBe('Closed');
      expect(closeRes.body.resolvedAt).toBe(originalResolvedAt);
    });

    it('WF-12: Transition Closed -> Reopened by staff requires reason, clears resolvedAt', async () => {
      const ticket = await createTicket('Closed', staff1Id);

      // Missing reason rejected
      const badRes = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Reopened', reason: '', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(badRes.status).toBe(400);

      // Valid reason succeeds
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          status: 'Reopened',
          reason: 'Requester reported issue recurred after patch update',
          lastUpdatedAt: ticket.updatedAt.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Reopened');
      expect(res.body.resolvedAt).toBeNull();

      const notes = await prisma.internalNote.findMany({ where: { ticketId: ticket.id } });
      expect(notes.length).toBe(1);
      expect(notes[0].content).toContain('Requester reported issue recurred');
    });

    it('WF-13a: Outgoing transition Reopened -> In Progress with assigned owner succeeds', async () => {
      const ticket = await createTicket('Reopened', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('In Progress');
      expect(res.body.resolvedAt).toBeNull();
    });

    it('WF-13b: Outgoing transition Reopened -> Open with unassigned ticket succeeds', async () => {
      const ticket = await createTicket('Reopened', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Open');
      expect(res.body.resolvedAt).toBeNull();
    });

    it('WF-13c: Outgoing transition Reopened -> Waiting for Requester with unassigned ticket succeeds with comment', async () => {
      const ticket = await createTicket('Reopened', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          status: 'Waiting for Requester',
          comment: 'Please send screenshots of current error screen',
          lastUpdatedAt: ticket.updatedAt.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Waiting for Requester');
      expect(res.body.resolvedAt).toBeNull();

      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
    });

    it('WF-13d: Outgoing transition Reopened -> In Progress without assigned owner is rejected', async () => {
      const ticket = await createTicket('Reopened', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Ticket must be assigned to an owner before transitioning from 'Reopened' to 'In Progress'.");
    });

    it('WF-14: Invalid transition Reopened -> Resolved directly is rejected', async () => {
      const ticket = await createTicket('Reopened', staff1Id);
      await logAction(ticket.id, staff1Id);

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid status transition from 'Reopened' to 'Resolved'.");
    });

    it('WF-15: Transition Waiting for Requester -> Open with unassigned ticket succeeds', async () => {
      const ticket = await createTicket('Waiting for Requester', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Open');
    });

    it('WF-16: Transition Waiting for Requester -> In Progress with unassigned ticket succeeds', async () => {
      const ticket = await createTicket('Waiting for Requester', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('In Progress');
    });
  });

  describe('Compare-And-Swap Concurrency Control for Status Updates (CON-04..06)', () => {
    it('CON-04: Rejects missing, malformed, non-strict, or invalid calendar lastUpdatedAt', async () => {
      const ticket = await createTicket('New', staff1Id);

      // 1. Missing lastUpdatedAt
      const resMissing = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open' });
      expect(resMissing.status).toBe(400);

      // 2. Malformed string
      const resMalformed = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: 'not-a-date' });
      expect(resMalformed.status).toBe(400);

      // 3. Missing timezone designator
      const resNoTz = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: '2026-11-01T12:00:00' });
      expect(resNoTz.status).toBe(400);

      // 4. Invalid calendar date (Feb 30)
      const resFeb30 = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: '2026-02-30T12:00:00Z' });
      expect(resFeb30.status).toBe(400);

      // Verify DB unchanged
      const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(current?.status).toBe('New');
    });

    it('CON-05: Returns 409 Conflict when lastUpdatedAt is stale', async () => {
      const ticket = await createTicket('New', staff1Id);
      const staleTimestamp = new Date(Date.now() - 60000).toISOString();

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ status: 'Open', lastUpdatedAt: staleTimestamp });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      const current = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(current?.status).toBe('New');
    });

    it('CON-06: Simultaneous concurrent conditional status updates to the same ticket produce exactly one 200 OK and one 409 Conflict', async () => {
      const ticket = await createTicket('New', staff1Id);
      const token = ticket.updatedAt.toISOString();

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/staff/tickets/${ticket.id}/status`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({ status: 'Open', lastUpdatedAt: token }),
        request(app)
          .patch(`/api/staff/tickets/${ticket.id}/status`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({ status: 'Cancelled', reason: 'Concurrent cancellation', lastUpdatedAt: token })
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const finalTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(['Open', 'Cancelled']).toContain(finalTicket?.status);
    });
  });

  describe('Requester Advisory Resolution Feedback (CMT-05..06)', () => {
    it('CMT-05: Requester submits Appears Resolved on In Progress ticket; status remains In Progress', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const idempotencyKey = crypto.randomUUID();

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('The requester has indicated that the problem appears resolved.');

      const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updated?.status).toBe('In Progress');
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());

      // Validation failures:
      // Missing lastUpdatedAt
      const resMissing = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({});
      expect(resMissing.status).toBe(400);

      // Malformed timestamp
      const resBadDate = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ lastUpdatedAt: 'invalid-iso' });
      expect(resBadDate.status).toBe(400);

      // Invalid UUIDv4 key
      const resBadKey = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ lastUpdatedAt: updated!.updatedAt.toISOString() });
      expect(resBadKey.status).toBe(400);
    });

    it('CMT-06: Requester triggers Appears Resolved on New or Open ticket is rejected with 400', async () => {
      const newTicket = await createTicket('New', null);
      const resNew = await request(app)
        .post(`/api/tickets/${newTicket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ lastUpdatedAt: newTicket.updatedAt.toISOString() });

      expect(resNew.status).toBe(400);
      expect(resNew.body.error).toContain('Advisory resolution feedback is permitted only when ticket is In Progress.');

      const openTicket = await createTicket('Open', staff1Id);
      const resOpen = await request(app)
        .post(`/api/tickets/${openTicket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ lastUpdatedAt: openTicket.updatedAt.toISOString() });

      expect(resOpen.status).toBe(400);
      expect(resOpen.body.error).toContain('Advisory resolution feedback is permitted only when ticket is In Progress.');
    });

    it('CMT-06b: Non-requester roles cannot trigger appears-resolved', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const resStaff = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(resStaff.status).toBe(403);

      const resOtherReq = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${otherRequesterCookie}`)
        .send({ lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(resOtherReq.status).toBe(404); // non-enumeration
    });
  });
});
