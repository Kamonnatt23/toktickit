import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app, isIdempotencyKeyP2002 } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

describe('Idempotency Architecture & Concurrency API (Lab 4)', () => {
  const prisma = getPrisma();

  let requesterCookie: string;
  let otherRequesterCookie: string;
  let staff1Cookie: string;
  let staff2Cookie: string;

  let requesterId: number;
  let otherRequesterId: number;
  let staff1Id: number;
  let staff2Id: number;

  let catId: number;
  let sysId: number;

  const createTicket = async (status: string, ownerId: number | null, customReqId?: number) => {
    return await prisma.ticket.create({
      data: {
        categoryId: catId,
        relatedSystemId: sysId,
        summary: `Idempotency Test Ticket ${Date.now()}`,
        description: 'Testing idempotency replays and collisions',
        priority: 'High',
        itPriority: 'High',
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

    const reqUser = await createTestUser(`req-idemp-${suffix}@test.com`, 'Requester');
    requesterId = reqUser.id;
    const otherReq = await createTestUser(`other-idemp-${suffix}@test.com`, 'Requester');
    otherRequesterId = otherReq.id;
    const s1 = await createTestUser(`staff1-idemp-${suffix}@test.com`, 'IT Staff');
    staff1Id = s1.id;
    const s2 = await createTestUser(`staff2-idemp-${suffix}@test.com`, 'IT Staff');
    staff2Id = s2.id;

    const getCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    };

    requesterCookie = await getCookie(`req-idemp-${suffix}@test.com`);
    otherRequesterCookie = await getCookie(`other-idemp-${suffix}@test.com`);
    staff1Cookie = await getCookie(`staff1-idemp-${suffix}@test.com`);
    staff2Cookie = await getCookie(`staff2-idemp-${suffix}@test.com`);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `Cat-${suffix}` } });
    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `Sys-${suffix}` } });
    catId = cat.id;
    sysId = sys.id;
  });

  describe('Sequential Retry Replay & Payload Fingerprinting (IDEMP-01..02)', () => {
    it('IDEMP-01: Sequential retry replay on POST /comments returns 201 with Idempotency-Replayed: true', async () => {
      const ticket = await createTicket('Open', staff1Id);
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        content: 'Testing idempotent comment creation',
        lastUpdatedAt: ticket.updatedAt.toISOString()
      };

      // Request 1: Fresh submission
      const res1 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBeUndefined();
      const firstCommentId = res1.body.id;

      // Request 2: Replay identical request
      const res2 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.body.id).toBe(firstCommentId);

      // Verify DB has exactly one comment
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
    });

    it('IDEMP-02: Payload mismatch rejection returns 409 Conflict', async () => {
      const ticket = await createTicket('Open', staff1Id);
      const idempotencyKey = crypto.randomUUID();

      // Original request
      const res1 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ content: 'Original message', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(res1.status).toBe(201);

      // Reused key with different payload
      const res2 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ content: 'Modified message', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe('Idempotency key reused with different request payload');
    });
  });

  describe('Advisory & Comment Replay Preservation (IDEMP-04..05)', () => {
    it('IDEMP-04: Re-send POST /appears-resolved replays without duplicate comments or changing status', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const idempotencyKey = crypto.randomUUID();
      const payload = { lastUpdatedAt: ticket.updatedAt.toISOString() };

      const res1 = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      expect(res1.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBeUndefined();

      // Retry
      const res2 = await request(app)
        .post(`/api/tickets/${ticket.id}/appears-resolved`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.body.id).toBe(res1.body.id);

      // Check DB: exactly one comment, status still In Progress
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);

      const dbTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.status).toBe('In Progress');
    });

    it('IDEMP-05: Re-send POST /comments on auto-transitioning ticket replays cleanly', async () => {
      const ticket = await createTicket('Waiting for Requester', staff1Id);
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        content: 'Replying to auto-transition ticket to Open',
        lastUpdatedAt: ticket.updatedAt.toISOString()
      };

      const res1 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      expect(res1.status).toBe(201);

      const ticketAfterRes1 = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(ticketAfterRes1?.status).toBe('Open');

      // Re-send with original payload and token
      const res2 = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.body.id).toBe(res1.body.id);

      // Comments count is 1
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
    });
  });

  describe('Compound Key Scope Isolation & TTL Expiration (IDEMP-06..08)', () => {
    it('IDEMP-06: Distinct Idempotency-Key submissions succeed independently', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const key1 = crypto.randomUUID();
      const key2 = crypto.randomUUID();

      const res1 = await request(app)
        .post(`/api/tickets/${ticket.id}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key1)
        .send({
          actionDescription: 'Step 1 completed',
          result: 'Step 1 success',
          followUpRequired: false
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/api/tickets/${ticket.id}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key2)
        .send({
          actionDescription: 'Step 2 completed',
          result: 'Step 2 success',
          followUpRequired: false
        });
      expect(res2.status).toBe(201);

      const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id } });
      expect(actions.length).toBe(2);
    });

    it('IDEMP-07: Compound key scope isolation isolates [route, ticketId, userId, key]', async () => {
      const ticket1 = await createTicket('Open', staff1Id);
      const ticket2 = await createTicket('Open', staff1Id);
      const sharedKey = crypto.randomUUID();

      // Same key used on ticket1
      const res1 = await request(app)
        .post(`/api/tickets/${ticket1.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({ content: 'Comment on ticket 1', lastUpdatedAt: ticket1.updatedAt.toISOString() });
      expect(res1.status).toBe(201);

      // Same key used on ticket2 by same user -> independent entry (different ticketId)
      const res2 = await request(app)
        .post(`/api/tickets/${ticket2.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({ content: 'Comment on ticket 2', lastUpdatedAt: ticket2.updatedAt.toISOString() });
      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBeUndefined();

      // Same key used by staff on ticket1 -> independent entry (different userId)
      const freshTicket1 = await prisma.ticket.findUnique({ where: { id: ticket1.id } });
      const resStaff = await request(app)
        .post(`/api/tickets/${ticket1.id}/comments`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({ content: 'Staff comment on ticket 1', lastUpdatedAt: freshTicket1!.updatedAt.toISOString() });
      expect(resStaff.status).toBe(201);
      expect(resStaff.headers['idempotency-replayed']).toBeUndefined();
    });

    it('IDEMP-08: Expired idempotency key (> 24 hours old) is safely pruned and reused', async () => {
      const ticket = await createTicket('Open', staff1Id);
      const expiredKey = crypto.randomUUID();

      // Manually insert an expired key (> 24h old)
      await prisma.idempotencyKey.create({
        data: {
          key: expiredKey,
          route: 'POST /api/tickets/:id/comments',
          ticketId: ticket.id,
          userId: requesterId,
          requestHash: 'dummyhash',
          statusCode: 201,
          responseBody: JSON.stringify({ id: 9999, content: 'Old comment' }),
          expiresAt: new Date(Date.now() - 3600000) // expired 1 hour ago
        }
      });

      // Submit new request with the expired key
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', expiredKey)
        .send({ content: 'Fresh comment after key expired', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(201);
      expect(res.headers['idempotency-replayed']).toBeUndefined();
      expect(res.body.content).toBe('Fresh comment after key expired');

      // Verify the record was refreshed with future expiration
      const keyRecord = await prisma.idempotencyKey.findFirst({
        where: { key: expiredKey, ticketId: ticket.id }
      });
      expect(keyRecord?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('IDEMP-09: POST /api/tickets/:id/actions requires mandatory UUIDv4 Idempotency-Key', async () => {
      const ticket = await createTicket('Open', staff1Id);

      // Missing header
      const resMissing = await request(app)
        .post(`/api/tickets/${ticket.id}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionDescription: 'Test action',
          result: 'Test result',
          followUpRequired: false
        });
      expect(resMissing.status).toBe(400);
      expect(resMissing.body.error).toContain('Idempotency-Key header is required');

      // Malformed header
      const resBad = await request(app)
        .post(`/api/tickets/${ticket.id}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', 'invalid-uuid-123')
        .send({
          actionDescription: 'Test action',
          result: 'Test result',
          followUpRequired: false
        });
      expect(resBad.status).toBe(400);
      expect(resBad.body.error).toContain('Invalid Idempotency-Key header format');
    });

    it('IDEMP-03: Concurrent requests with identical Idempotency-Key replay correctly without false 409', async () => {
      const ticket = await createTicket('Open', staff1Id);
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        content: 'Concurrent identical comment test',
        lastUpdatedAt: ticket.updatedAt.toISOString()
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
        request(app)
          .post(`/api/tickets/${ticket.id}/comments`)
          .set('Cookie', `sessionId=${requesterCookie}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Exactly one was replayed
      const replayedCount = (res1.headers['idempotency-replayed'] ? 1 : 0) + (res2.headers['idempotency-replayed'] ? 1 : 0);
      expect(replayedCount).toBe(1);

      // Only one comment in DB
      const comments = await prisma.publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
    });
  });

  describe('P2002 Exact Idempotency Collision Matching', () => {
    it('recognizes exact four-field array regardless of field order', () => {
      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['route', 'ticketId', 'userId', 'key'] }
      })).toBe(true);

      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['key', 'userId', 'ticketId', 'route'] }
      })).toBe(true);
    });

    it('rejects unrelated target array such as [User, email]', () => {
      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['User', 'email'] }
      })).toBe(false);
    });

    it('rejects target array containing only key plus other fields or incorrect length', () => {
      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['key', 'other'] }
      })).toBe(false);

      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['route', 'ticketId', 'userId', 'key', 'extra'] }
      })).toBe(false);

      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: ['route', 'ticketId', 'userId', 'userId'] }
      })).toBe(false);
    });

    it('rejects string target containing compound constraint name or substring fallback', () => {
      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: 'route_ticketId_userId_key' }
      })).toBe(false);

      expect(isIdempotencyKeyP2002({
        code: 'P2002',
        meta: { target: 'IdempotencyKey_route_ticketId_userId_key_key' }
      })).toBe(false);
    });

    it('rejects non-P2002 error codes', () => {
      expect(isIdempotencyKeyP2002({
        code: 'P2025',
        meta: { target: ['route', 'ticketId', 'userId', 'key'] }
      })).toBe(false);

      expect(isIdempotencyKeyP2002(new Error('Normal error'))).toBe(false);
    });

    it('rethrows unrelated P2002 error rather than swallowing as idempotency replay', () => {
      const mockP2002 = new Error('Unique constraint failed on the fields: (`email`)');
      (mockP2002 as any).code = 'P2002';
      (mockP2002 as any).meta = { target: ['email'] };

      expect(isIdempotencyKeyP2002(mockP2002)).toBe(false);

      // Verify catch block logic rethrows unrelated P2002 rather than swallowing as replay
      const handleCatch = (err: any) => {
        if (err.code === 'P2002') {
          if (isIdempotencyKeyP2002(err)) {
            return 'replayed';
          }
          throw err;
        }
        return 'other';
      };

      expect(() => handleCatch(mockP2002)).toThrow(mockP2002);
    });
  });
});
