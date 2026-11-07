import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

describe('Ticket Comments & Comment-Driven Auto-Transitions API (Lab 4)', () => {
  const prisma = getPrisma();

  let requesterCookie: string;
  let otherRequesterCookie: string;
  let staffCookie: string;
  let adminCookie: string;

  let requesterId: number;
  let otherRequesterId: number;
  let staffId: number;
  let adminId: number;

  let catId: number;
  let sysId: number;

  const createTicket = async (status: string, ownerId: number | null, customReqId?: number) => {
    return await prisma.ticket.create({
      data: {
        categoryId: catId,
        relatedSystemId: sysId,
        summary: `Comments Test Ticket ${Date.now()}`,
        description: 'Testing comment auto-transitions and CAS',
        priority: 'Medium',
        itPriority: 'Medium',
        status,
        requesterId: customReqId || requesterId,
        ownerId,
        resolvedAt: status === 'Resolved' || status === 'Closed' ? new Date() : null
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

    const reqUser = await createTestUser(`req-cmt-${suffix}@test.com`, 'Requester');
    requesterId = reqUser.id;
    const otherReq = await createTestUser(`other-cmt-${suffix}@test.com`, 'Requester');
    otherRequesterId = otherReq.id;
    const staffUser = await createTestUser(`staff-cmt-${suffix}@test.com`, 'IT Staff');
    staffId = staffUser.id;
    const adminUser = await createTestUser(`admin-cmt-${suffix}@test.com`, 'Administrator');
    adminId = adminUser.id;

    const getCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    };

    requesterCookie = await getCookie(`req-cmt-${suffix}@test.com`);
    otherRequesterCookie = await getCookie(`other-cmt-${suffix}@test.com`);
    staffCookie = await getCookie(`staff-cmt-${suffix}@test.com`);
    adminCookie = await getCookie(`admin-cmt-${suffix}@test.com`);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `Cat-${suffix}` } });
    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `Sys-${suffix}` } });
    catId = cat.id;
    sysId = sys.id;
  });

  describe('Comment-Driven Auto-Transitions (CMT-01..04, CMT-07..08)', () => {
    it('CMT-01: Requester comment on Waiting for Requester auto-transitions to Open and validates fields', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);

      // Validation 1: missing or blank content (400)
      const resEmpty = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: '   ', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(resEmpty.status).toBe(400);

      // Validation 2: missing lastUpdatedAt (400)
      const resNoToken = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'Here is requested info' });
      expect(resNoToken.status).toBe(400);

      // Validation 3: malformed or non-strict lastUpdatedAt (400)
      const resBadToken = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'Here is info', lastUpdatedAt: '2026-02-30T10:00:00Z' });
      expect(resBadToken.status).toBe(400);

      // Valid comment succeeds and auto-transitions to Open
      const resValid = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'I have attached the screenshot.', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(resValid.status).toBe(201);
      expect(resValid.body.content).toBe('I have attached the screenshot.');

      const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updatedTicket?.status).toBe('Open');
      expect(updatedTicket?.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
    });

    it('CMT-02: Requester comment on Resolved ticket auto-transitions to Reopened and clears resolvedAt', async () => {
      const ticket = await createTicket('Resolved', staffId);
      expect(ticket.resolvedAt).not.toBeNull();

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'The issue came back today.', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(201);

      const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updated?.status).toBe('Reopened');
      expect(updated?.resolvedAt).toBeNull();
    });

    it('CMT-03: Requester comment on Closed ticket auto-transitions to Reopened and clears resolvedAt', async () => {
      const ticket = await createTicket('Closed', staffId);
      expect(ticket.resolvedAt).not.toBeNull();

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'Please reopen, computer failed again.', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(201);

      const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updated?.status).toBe('Reopened');
      expect(updated?.resolvedAt).toBeNull();
    });

    it('CMT-04: IT Staff comment on Waiting for Requester ticket leaves status unchanged', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${staffCookie}`)
        .send({ content: 'Following up on this ticket.', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(201);

      const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(updated?.status).toBe('Waiting for Requester');
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
    });

    it('CMT-07: Requester comment on New, Open, In Progress, Reopened, Cancelled leaves status unchanged', async () => {
      const statuses = ['New', 'Open', 'In Progress', 'Reopened', 'Cancelled'];

      for (const st of statuses) {
        const ticket = await createTicket(st, staffId);
        const res = await request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .send({ content: `Comment while in ${st}`, lastUpdatedAt: ticket.updatedAt.toISOString() });

        expect(res.status).toBe(201);
        const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
        expect(updated?.status).toBe(st);
      }
    });

    it('CMT-08: IT Staff comment on Resolved or Closed does not auto-reopen; Administrator is rejected with 403', async () => {
      const resolvedTicket = await createTicket('Resolved', staffId);

      // Staff comment on Resolved -> status remains Resolved
      const resStaff = await request(app)
        .post(`/api/tickets/${resolvedTicket.id}/comments`)
        .set('Cookie', `sessionId=${staffCookie}`)
        .send({ content: 'Staff closing remark', lastUpdatedAt: resolvedTicket.updatedAt.toISOString() });

      expect(resStaff.status).toBe(201);
      const updatedResolved = await prisma.ticket.findUnique({ where: { id: resolvedTicket.id } });
      expect(updatedResolved?.status).toBe('Resolved');

      // Admin attempt -> 403 Forbidden
      const resAdmin = await request(app)
        .post(`/api/tickets/${resolvedTicket.id}/comments`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({ content: 'Admin remark', lastUpdatedAt: updatedResolved!.updatedAt.toISOString() });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error).toContain('Administrators cannot post comments');

      // Requester on unowned ticket -> 404 non-enumeration
      const resOther = await request(app)
        .post(`/api/tickets/${resolvedTicket.id}/comments`)
        .set('Cookie', `sessionId=${otherRequesterCookie}`)
        .send({ content: 'Other requester remark', lastUpdatedAt: updatedResolved!.updatedAt.toISOString() });

      expect(resOther.status).toBe(404);
    });
  });

  describe('CAS Protection on Comments & Advisory Resolution (CON-08)', () => {
    const runWithCapturedWhere = async (
      fn: () => Promise<any>,
      onBeforeUpdateMany?: (tx: any) => Promise<void>
    ) => {
      let capturedWhere: any = null;
      const origTransaction = prisma.$transaction.bind(prisma);
      const txSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (transactionFn: any, ...args: any[]) => {
        if (typeof transactionFn === 'function') {
          return await origTransaction(async (tx: any) => {
            const origUpdateMany = tx.ticket.updateMany.bind(tx.ticket);
            tx.ticket.updateMany = async (params: any) => {
              capturedWhere = params.where;
              if (onBeforeUpdateMany) {
                await onBeforeUpdateMany(tx);
              }
              return await origUpdateMany(params);
            };
            return await transactionFn(tx);
          });
        }
        return await origTransaction(transactionFn, ...args);
      });

      try {
        const res = await fn();
        return { res, capturedWhere };
      } finally {
        txSpy.mockRestore();
      }
    };

    it('CON-08: Stale lastUpdatedAt returns 409 Conflict and rolls back comment creation', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const staleToken = new Date(Date.now() - 30000).toISOString();

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ content: 'Should fail due to stale token', lastUpdatedAt: staleToken });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Verify no comment created in DB
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Verify status not auto-transitioned
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('Waiting for Requester');
    });

    it('CON-08-CMT-1: [POST /comments] Scenario 1: Concurrent Staff status change while in-flight returns 409 Conflict, uses 3-predicate CAS, and rolls back', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const token = ticket.updatedAt.toISOString();
      const distinctKey = crypto.randomUUID();

      const { res, capturedWhere } = await runWithCapturedWhere(
        () => request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ content: 'Comment during status race', lastUpdatedAt: token }),
        async () => {
          // Simulate concurrent staff status update in DB before updateMany executes
          await prisma.$executeRawUnsafe(
            `UPDATE "Ticket" SET status = 'In Progress', "updatedAt" = NOW() WHERE id = $1`,
            ticket.id
          );
        }
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Database conditional update matched all three predicates: id, status, and updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('Waiting for Requester');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // No PublicComment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Status remains In Progress (from concurrent update), resolvedAt is null
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');
      expect(dbTicket?.resolvedAt).toBeNull();

      // Failed transaction did not leave an idempotency reservation behind
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08-CMT-1b: [POST /comments] Scenario 1 (Prior): Stale lastUpdatedAt after Staff status change returns 409 Conflict with 3-predicate CAS', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const token = ticket.updatedAt.toISOString();

      // Staff updates status to In Progress first
      const staffUpdate = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie}`)
        .send({ status: 'In Progress', lastUpdatedAt: token });
      expect(staffUpdate.status).toBe(200);

      const distinctKey = crypto.randomUUID();
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ content: 'Requester comment with old token', lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Database conditional update matched all three predicates
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('In Progress');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Status remains In Progress
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');

      // No idempotency reservation left
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08-CMT-2: [POST /comments] Scenario 2: Concurrent Staff owner change while status remains unchanged returns 409 Conflict', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Staff reassigns owner while status remains 'Waiting for Requester'
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { ownerId: adminId, updatedAt: new Date() }
      });

      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('Waiting for Requester');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      const distinctKey = crypto.randomUUID();
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ content: 'Comment after owner reassignment', lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('Waiting for Requester');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('Waiting for Requester');
      expect(dbTicket?.ownerId).toBe(adminId);
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // No idempotency reservation left
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08-CMT-3: [POST /comments] Scenario 3: Concurrent Staff priority change while status remains unchanged returns 409 Conflict', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Staff updates priority while status remains 'Waiting for Requester'
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { itPriority: 'Critical', updatedAt: new Date() }
      });

      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('Waiting for Requester');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      // Unkeyed request
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .send({ content: 'Comment after priority change', lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('Waiting for Requester');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('Waiting for Requester');
      expect(dbTicket?.itPriority).toBe('Critical');
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // No idempotency reservation left
      const reservation = await prisma.idempotencyKey.findFirst({ where: { ticketId: ticket.id } });
      expect(reservation).toBeNull();
    });

    it('CON-08-CMT-4: [POST /comments] Scenario 4: ABA status transition returns 409 Conflict even though current status matches expected status', async () => {
      const ticket = await createTicket('Waiting for Requester', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Transition A -> B: Waiting for Requester -> In Progress
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'In Progress', updatedAt: new Date() }
      });

      await new Promise((r) => setTimeout(r, 25));

      // Transition B -> A: In Progress -> Waiting for Requester
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'Waiting for Requester', updatedAt: new Date() }
      });

      // Current DB ticket has status 'Waiting for Requester' (matches expected status!)
      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('Waiting for Requester');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      const distinctKey = crypto.randomUUID();
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ content: 'Comment after ABA transition', lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('Waiting for Requester');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('Waiting for Requester');
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Failed transaction did not leave an idempotency reservation behind
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08d: Appears-Resolved CAS stale lastUpdatedAt returns 409 Conflict and rolls back', async () => {
      const ticket = await createTicket('In Progress', staffId);
      const staleToken = new Date(Date.now() - 60000).toISOString();

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ lastUpdatedAt: staleToken });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Advisory feedback requires the ticket to remain In Progress at the current revision');

      // Verify no comment created
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);
    });

    it('CON-08-RES-1: [POST /appears-resolved] Scenario 1: Concurrent Staff status change while in-flight returns 409 Conflict, uses 3-predicate CAS, and rolls back', async () => {
      const ticket = await createTicket('In Progress', staffId);
      const token = ticket.updatedAt.toISOString();
      const distinctKey = crypto.randomUUID();

      const { res, capturedWhere } = await runWithCapturedWhere(
        () => request(app)
          .post(`/api/tickets/${ticket.id}/appears-resolved`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ lastUpdatedAt: token }),
        async () => {
          // Simulate concurrent staff status transition to Resolved before updateMany executes
          await prisma.$executeRawUnsafe(
            `UPDATE "Ticket" SET status = 'Resolved', "resolvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
            ticket.id
          );
        }
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Advisory feedback requires the ticket to remain In Progress at the current revision');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('In Progress');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Status remains Resolved from concurrent update
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('Resolved');

      // Failed transaction did not leave an idempotency reservation behind
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08-RES-2: [POST /appears-resolved] Scenario 2: Concurrent Staff owner change while status remains unchanged returns 409 Conflict', async () => {
      const ticket = await createTicket('In Progress', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Staff reassigns owner while status remains 'In Progress'
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { ownerId: adminId, updatedAt: new Date() }
      });

      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('In Progress');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      const distinctKey = crypto.randomUUID();
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/appears-resolved`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Advisory feedback requires the ticket to remain In Progress at the current revision');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('In Progress');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');
      expect(dbTicket?.ownerId).toBe(adminId);
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Failed transaction did not leave an idempotency reservation behind
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });

    it('CON-08-RES-3: [POST /appears-resolved] Scenario 3: Concurrent Staff priority change while status remains unchanged returns 409 Conflict', async () => {
      const ticket = await createTicket('In Progress', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Staff updates priority while status remains 'In Progress'
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { itPriority: 'Critical', updatedAt: new Date() }
      });

      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('In Progress');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      // Unkeyed request
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/appears-resolved`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .send({ lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Advisory feedback requires the ticket to remain In Progress at the current revision');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('In Progress');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');
      expect(dbTicket?.itPriority).toBe('Critical');
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // No idempotency reservation left
      const reservation = await prisma.idempotencyKey.findFirst({ where: { ticketId: ticket.id } });
      expect(reservation).toBeNull();
    });

    it('CON-08-RES-4: [POST /appears-resolved] Scenario 4: ABA status transition returns 409 Conflict even though current status matches expected status', async () => {
      const ticket = await createTicket('In Progress', staffId);
      const token = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Transition A -> B: In Progress -> Waiting for Requester
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'Waiting for Requester', updatedAt: new Date() }
      });

      await new Promise((r) => setTimeout(r, 25));

      // Transition B -> A: Waiting for Requester -> In Progress
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'In Progress', updatedAt: new Date() }
      });

      // Current DB ticket has status 'In Progress' (matches expected status!)
      const preCheck = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(preCheck?.status).toBe('In Progress');
      expect(preCheck?.updatedAt.getTime()).toBeGreaterThan(new Date(token).getTime());

      const distinctKey = crypto.randomUUID();
      const { res, capturedWhere } = await runWithCapturedWhere(() =>
        request(app)
          .post(`/api/tickets/${ticket.id}/appears-resolved`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', distinctKey)
          .send({ lastUpdatedAt: token })
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Advisory feedback requires the ticket to remain In Progress at the current revision');

      // Database conditional update evaluated all 3 predicates: id, status, updatedAt
      expect(capturedWhere).toBeTruthy();
      expect(capturedWhere.id).toBe(ticket.id);
      expect(capturedWhere.status).toBe('In Progress');
      expect(capturedWhere.updatedAt.getTime()).toBe(new Date(token).getTime());

      // Stale timestamp rejected even though current status equals expected status
      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');
      expect(dbTicket?.resolvedAt).toBeNull();

      // No comment persisted
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);

      // Failed transaction did not leave an idempotency reservation behind
      const reservation = await prisma.idempotencyKey.findFirst({ where: { key: distinctKey } });
      expect(reservation).toBeNull();
    });
  });
});
