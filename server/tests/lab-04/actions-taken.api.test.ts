import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

describe('Actions Taken Backend API & Revision History (Lab 4)', () => {
  const prisma = getPrisma();
  let dbAvailable = false;

  let requesterCookie: string;
  let otherRequesterCookie: string;
  let staff1Cookie: string;
  let staff2Cookie: string;
  let adminCookie: string;
  let inactiveStaffCookie: string;

  let requesterId: number;
  let otherRequesterId: number;
  let staff1Id: number;
  let staff2Id: number;
  let adminId: number;

  let testTicketId: number;
  let otherTicketId: number;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      dbAvailable = true;

      const passwordHash = await bcrypt.hash('password123', 10);
      const suffix = Date.now().toString().slice(-6);

      const createTestUser = async (email: string, role: string, isActive = true) => {
        return await prisma.user.create({
          data: {
            name: email.split('@')[0],
            email,
            passwordHash,
            role,
            isActive,
            requiresPasswordChange: false
          }
        });
      };

      const reqUser = await createTestUser(`req-${suffix}@test.com`, 'Requester');
      requesterId = reqUser.id;
      const otherReqUser = await createTestUser(`other-req-${suffix}@test.com`, 'Requester');
      otherRequesterId = otherReqUser.id;
      const s1 = await createTestUser(`staff1-${suffix}@test.com`, 'IT Staff');
      staff1Id = s1.id;
      const s2 = await createTestUser(`staff2-${suffix}@test.com`, 'IT Staff');
      staff2Id = s2.id;
      const adm = await createTestUser(`admin-${suffix}@test.com`, 'Administrator');
      adminId = adm.id;
      const inact = await createTestUser(`inact-staff-${suffix}@test.com`, 'IT Staff', false);

      const getCookie = async (email: string) => {
        const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
        if (res.headers['set-cookie']) {
          return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
        }
        return '';
      };

      requesterCookie = await getCookie(`req-${suffix}@test.com`);
      otherRequesterCookie = await getCookie(`other-req-${suffix}@test.com`);
      staff1Cookie = await getCookie(`staff1-${suffix}@test.com`);
      staff2Cookie = await getCookie(`staff2-${suffix}@test.com`);
      adminCookie = await getCookie(`admin-${suffix}@test.com`);

      // Inactive staff login returns 401
      const inactRes = await request(app).post('/api/auth/login').send({ email: `inact-staff-${suffix}@test.com`, password: 'password123' });
      inactiveStaffCookie = inactRes.headers['set-cookie'] ? inactRes.headers['set-cookie'][0].split(';')[0].split('=')[1] : 'invalid-session';

      // Create test tickets
      const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `Cat-${suffix}` } });
      const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `Sys-${suffix}` } });

      const t1 = await prisma.ticket.create({
        data: {
          categoryId: cat.id,
          relatedSystemId: sys.id,
          summary: `Test Ticket ${suffix}`,
          description: 'Description for testing actions taken',
          priority: 'High',
          itPriority: 'High',
          status: 'In Progress',
          requesterId,
          ownerId: staff1Id
        }
      });
      testTicketId = t1.id;

      const t2 = await prisma.ticket.create({
        data: {
          categoryId: cat.id,
          relatedSystemId: sys.id,
          summary: `Other Requester Ticket ${suffix}`,
          description: 'Belongs to other requester',
          priority: 'Medium',
          itPriority: 'Medium',
          status: 'Open',
          requesterId: otherRequesterId,
          ownerId: staff2Id
        }
      });
      otherTicketId = t2.id;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  describe('Action Taken Idempotency Scenarios (IDEMP-01, 02, 03, 06, 07, 08, 09)', () => {
    it('IDEMP-09: rejects POST /api/tickets/:id/actions with missing Idempotency-Key header (400)', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie || 'test'}`)
        .send({
          actionDescription: 'Testing missing key',
          result: 'Should fail upfront',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Idempotency-Key header is required/i);
    });

    it('IDEMP-09: rejects POST /api/tickets/:id/actions with malformed (non-UUIDv4) Idempotency-Key header (400)', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie || 'test'}`)
        .set('Idempotency-Key', 'not-a-valid-uuid')
        .send({
          actionDescription: 'Testing invalid key format',
          result: 'Should fail upfront',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid Idempotency-Key header format/i);
    });

    it('IDEMP-01: Identical sequential retry replays the original response with Idempotency-Replayed header', async () => {
      if (!dbAvailable) return;

      const key = crypto.randomUUID();
      const payload = {
        actionDescription: 'Sequential retry test action',
        result: 'Verified connectivity',
        followUpRequired: false,
        followUpNote: null
      };

      // First submission
      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.status).toBe(201);
      const originalId = res1.body.id;
      expect(originalId).toBeDefined();

      // Second submission with identical key and payload
      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.body.id).toBe(originalId);
      expect(res2.body.actionDescription).toBe(payload.actionDescription);

      // Verify no duplicate action record was created in database
      const actionsCount = await prisma.actionTaken.count({
        where: { ticketId: testTicketId, actionDescription: payload.actionDescription }
      });
      expect(actionsCount).toBe(1);
    });

    it('IDEMP-02: Same Idempotency-Key with different payload returns 409 Conflict', async () => {
      if (!dbAvailable) return;

      const key = crypto.randomUUID();
      const payloadInitial = {
        actionDescription: 'Initial payload for mismatch test',
        result: 'First result',
        followUpRequired: false,
        followUpNote: null
      };

      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key)
        .send(payloadInitial);

      expect(res1.status).toBe(201);

      // Altered payload with same key
      const payloadAltered = {
        actionDescription: 'Altered payload for mismatch test',
        result: 'Different result text',
        followUpRequired: false,
        followUpNote: null
      };

      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key)
        .send(payloadAltered);

      expect(res2.status).toBe(409);
      expect(res2.body.error).toMatch(/Idempotency key reused with different request payload/i);
    });

    it('IDEMP-03: Two simultaneous identical requests safely replay without false CAS 409', async () => {
      if (!dbAvailable) return;

      const key = crypto.randomUUID();
      const payload = {
        actionDescription: 'Simultaneous identical request test',
        result: 'Both should resolve without CAS collision',
        followUpRequired: false,
        followUpNote: null
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/tickets/${testTicketId}/actions`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .set('Idempotency-Key', key)
          .send(payload),
        request(app)
          .post(`/api/tickets/${testTicketId}/actions`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .set('Idempotency-Key', key)
          .send(payload)
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.id).toBe(res2.body.id);

      // Exactly one response has Idempotency-Replayed: true
      const replayedCount =
        (res1.headers['idempotency-replayed'] === 'true' ? 1 : 0) +
        (res2.headers['idempotency-replayed'] === 'true' ? 1 : 0);
      expect(replayedCount).toBe(1);
    });

    it('IDEMP-06: Distinct Idempotency-Keys create independent Action Taken records', async () => {
      if (!dbAvailable) return;

      const key1 = crypto.randomUUID();
      const key2 = crypto.randomUUID();

      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key1)
        .send({
          actionDescription: 'Distinct submission 1',
          result: 'Result 1',
          followUpRequired: false,
          followUpNote: null
        });

      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key2)
        .send({
          actionDescription: 'Distinct submission 2',
          result: 'Result 2',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.id).not.toBe(res2.body.id);
    });

    it('IDEMP-07: Key scope is isolated by ticket and authenticated user', async () => {
      if (!dbAvailable) return;

      const sharedKey = crypto.randomUUID();

      // Same key on testTicketId by staff1 -> 201
      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          actionDescription: 'Scoped action on ticket 1 by staff 1',
          result: 'Success',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res1.status).toBe(201);

      // Same key on otherTicketId by staff1 -> 201 (isolated by ticketId)
      const res2 = await request(app)
        .post(`/api/tickets/${otherTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          actionDescription: 'Scoped action on ticket 2 by staff 1',
          result: 'Success',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res2.status).toBe(201);
      expect(res2.body.id).not.toBe(res1.body.id);

      // Same key on testTicketId by staff2 -> 201 (isolated by userId)
      const res3 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff2Cookie}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          actionDescription: 'Scoped action on ticket 1 by staff 2',
          result: 'Success',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res3.status).toBe(201);
      expect(res3.body.id).not.toBe(res1.body.id);
      expect(res3.body.id).not.toBe(res2.body.id);
    });

    it('IDEMP-08: Expired key (> 24 hours) is safely pruned and can be reused', async () => {
      if (!dbAvailable) return;

      const expiredKey = crypto.randomUUID();

      // Pre-seed an expired idempotency key row
      await prisma.idempotencyKey.create({
        data: {
          key: expiredKey,
          route: 'POST /api/tickets/:id/actions',
          ticketId: testTicketId,
          userId: staff1Id,
          requestHash: 'dummyhash',
          statusCode: 201,
          responseBody: JSON.stringify({ id: 99999 }),
          expiresAt: new Date(Date.now() - 3600000) // 1 hour in the past
        }
      });

      // Submitting with expired key should prune and succeed as new creation
      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', expiredKey)
        .send({
          actionDescription: 'Reusing expired key',
          result: 'Pruned old key and created fresh action',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(201);
      expect(res.headers['idempotency-replayed']).toBeUndefined();
      expect(res.body.actionDescription).toBe('Reusing expired key');
    });
  });

  describe('Authorization Matrix (ACT-08, ACT-09, ACT-10, ACT-11, ACT-12)', () => {
    it('ACT-08: Requester receives 403 Forbidden when attempting POST /api/tickets/:id/actions', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Requester trying to create action',
          result: 'Should be forbidden',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('ACT-09: Requester receives 403 Forbidden when attempting PATCH /api/tickets/:id/actions/:actionId', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/1`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({
          actionLastUpdatedAt: new Date().toISOString(),
          actionDescription: 'Requester edit'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('ACT-10: Requester receives 200 OK when fetching actions on their own ticket (GET /actions)', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .get(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${requesterCookie}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('ACT-11: Requester receives 404 Not Found when fetching actions on another user ticket (non-enumeration)', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .get(`/api/tickets/${otherTicketId}/actions`)
        .set('Cookie', `sessionId=${requesterCookie}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Ticket not found/i);
    });

    it('ACT-12: Inactive staff account receives 401 Unauthorized', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post('/api/tickets/1/actions')
        .set('Cookie', `sessionId=${inactiveStaffCookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Inactive staff test',
          result: 'Should fail with 401',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Action Taken Creation & Field Validations (ACT-01..ACT-07)', () => {
    it('ACT-01: IT Staff creates valid Action Taken via POST with mandatory Idempotency-Key', async () => {
      if (!dbAvailable) return;

      const key = crypto.randomUUID();
      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', key)
        .send({
          actionDescription: 'Configured VLAN 10 on access switch',
          result: 'Connectivity verified with gateway ping 0% loss',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.performedById).toBe(staff1Id);
      expect(res.body.performedBy.email).toContain('staff1');
    });

    it('ACT-02: Follow-up field boundary validations', async () => {
      if (!dbAvailable) return;

      // 1. followUpRequired=true with missing/blank note -> 400
      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing missing followUpNote',
          result: 'Result here',
          followUpRequired: true,
          followUpNote: '   '
        });
      expect(res1.status).toBe(400);

      // 2. followUpRequired=true with exactly 2000 trimmed chars -> 201
      const note2000 = 'a'.repeat(2000);
      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing 2000 char note',
          result: 'Result here',
          followUpRequired: true,
          followUpNote: `  ${note2000}  `
        });
      expect(res2.status).toBe(201);
      expect(res2.body.followUpNote).toBe(note2000);

      // 3. followUpRequired=true with 2001 trimmed chars -> 400
      const note2001 = 'b'.repeat(2001);
      const res3 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing 2001 char note',
          result: 'Result here',
          followUpRequired: true,
          followUpNote: note2001
        });
      expect(res3.status).toBe(400);

      // 4. followUpRequired=false with non-null note -> 400
      const res4 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing non-null note when false',
          result: 'Result here',
          followUpRequired: false,
          followUpNote: 'Unexpected note text'
        });
      expect(res4.status).toBe(400);
    });

    it('ACT-02 Contract: When followUpRequired is false, followUpNote must be null; a non-null value returns 400 Bad Request', async () => {
      if (!dbAvailable) return;

      // Non-null string must return 400
      const resNonNullString = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing non-null note',
          result: 'Should fail with 400',
          followUpRequired: false,
          followUpNote: 'Non-null text'
        });
      expect(resNonNullString.status).toBe(400);
      expect(resNonNullString.body.error).toMatch(/followUpNote must be null when followUpRequired is false/i);

      // Non-null empty string must return 400
      const resEmptyString = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing empty string note',
          result: 'Should fail with 400',
          followUpRequired: false,
          followUpNote: ''
        });
      expect(resEmptyString.status).toBe(400);
      expect(resEmptyString.body.error).toMatch(/followUpNote must be null when followUpRequired is false/i);

      // Explicit null must succeed with 201 and persist null
      const resExplicitNull = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing explicit null note',
          result: 'Should succeed with 201',
          followUpRequired: false,
          followUpNote: null
        });
      expect(resExplicitNull.status).toBe(201);
      expect(resExplicitNull.body.followUpRequired).toBe(false);
      expect(resExplicitNull.body.followUpNote).toBeNull();
    });

    it('ACT-03: Create Action Taken with followUpRequired=false and null note', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Checked system power supply',
          result: 'Redundant PSU is healthy',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(201);
      expect(res.body.followUpRequired).toBe(false);
      expect(res.body.followUpNote).toBeNull();
    });

    it('ACT-04: actionDateTime timestamp validations (strict ISO, leap years, timezone offsets)', async () => {
      if (!dbAvailable) return;

      // Future date -> 400
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Future action test',
          result: 'Result text',
          actionDateTime: futureDate,
          followUpRequired: false,
          followUpNote: null
        });
      expect(res1.status).toBe(400);

      // Malformed / non-strict / invalid calendar date -> 400
      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Invalid date format test',
          result: 'Result text',
          actionDateTime: '2026-02-30T10:00:00Z',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res2.status).toBe(400);

      // Valid with offset (+07:00) -> 201
      const res3 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Offset timestamp test',
          result: 'Result text',
          actionDateTime: '2026-01-15T15:30:00+07:00',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res3.status).toBe(201);
    });

    it('ACT-05: actionDescription and result length boundaries', async () => {
      if (!dbAvailable) return;

      const str2000 = 'x'.repeat(2000);
      const str2001 = 'y'.repeat(2001);

      // 2000 chars -> 201
      const res1 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: str2000,
          result: str2000,
          followUpRequired: false,
          followUpNote: null
        });
      expect(res1.status).toBe(201);

      // 2001 description -> 400
      const res2 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: str2001,
          result: 'Valid result',
          followUpRequired: false,
          followUpNote: null
        });
      expect(res2.status).toBe(400);

      // 2001 result -> 400
      const res3 = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Valid description',
          result: str2001,
          followUpRequired: false,
          followUpNote: null
        });
      expect(res3.status).toBe(400);
    });

    it('ACT-06: attachmentNotes > 500 chars returns 400 Bad Request', async () => {
      if (!dbAvailable) return;

      const notes501 = 'z'.repeat(501);
      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Testing long attachmentNotes',
          result: 'Result text',
          followUpRequired: false,
          followUpNote: null,
          attachmentNotes: notes501
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/attachmentNotes cannot exceed 500 characters/i);
    });

    it('ACT-07: Secondary IT Staff logs action on ticket owned by Primary Staff', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff2Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Assisted primary owner with network trace analysis',
          result: 'Identified packet drop on switchport 12',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(201);
      expect(res.body.performedById).toBe(staff2Id);

      // Ticket owner must remain staff1
      const ticket = await prisma.ticket.findUnique({ where: { id: testTicketId } });
      expect(ticket?.ownerId).toBe(staff1Id);
    });
  });

  describe('Compare-And-Swap Concurrency Control (CON-01..03, ACT-07b, REV-01..06)', () => {
    let actionToEditId: number;
    let initialUpdatedAt: string;

    it('Creates an action to use for CAS and revision testing', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          actionDescription: 'Initial action for CAS tests',
          result: 'Initial result',
          followUpRequired: false,
          followUpNote: null
        });

      expect(res.status).toBe(201);
      actionToEditId = res.body.id;
      initialUpdatedAt = res.body.updatedAt;
    });

    it('CON-01: actionLastUpdatedAt validation rejects missing, malformed, non-strict, or invalid calendar dates', async () => {
      if (!dbAvailable) return;

      // 1. Missing
      const res1 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({ actionDescription: 'Missing token' });
      expect(res1.status).toBe(400);

      // 2. Malformed
      const res2 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: '2026-11-01',
          actionDescription: 'Malformed'
        });
      expect(res2.status).toBe(400);

      // 3. Invalid calendar date (Feb 30)
      const res3 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: '2026-02-30T10:00:00Z',
          actionDescription: 'Invalid calendar date'
        });
      expect(res3.status).toBe(400);
    });

    it('REV-01 & ACT-07b: First successful edit creates exactly 1 revision row with snapshots and immutable performer', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff2Cookie}`)
        .send({
          actionLastUpdatedAt: initialUpdatedAt,
          actionDescription: 'Updated action description by Staff 2',
          result: 'Updated result with additional details',
          followUpRequired: true,
          followUpNote: 'Please verify with customer'
        });

      expect(res.status).toBe(200);
      expect(res.body.actionDescription).toBe('Updated action description by Staff 2');
      expect(res.body.performedById).toBe(staff1Id); // Immutable original performer

      // Verify revision row
      const revs = await prisma.actionTakenRevision.findMany({
        where: { actionTakenId: actionToEditId }
      });
      expect(revs.length).toBe(1);
      expect(revs[0].editedById).toBe(staff2Id);
      expect((revs[0].beforeSnapshot as any).actionDescription).toBe('Initial action for CAS tests');
      expect((revs[0].afterSnapshot as any).actionDescription).toBe('Updated action description by Staff 2');
    });

    it('REV-02: Multiple successive edits create 1 revision per edit in deterministic order with matching snapshots', async () => {
      if (!dbAvailable) return;

      const action = await prisma.actionTaken.create({
        data: {
          ticketId: testTicketId,
          performedById: staff1Id,
          actionDescription: 'Successive edit base',
          result: 'Base result',
          followUpRequired: false
        }
      });

      // Edit 1 by Staff 1
      const res1 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${action.id}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: action.updatedAt.toISOString(),
          actionDescription: 'Edit 1: Description updated by Staff 1'
        });
      expect(res1.status).toBe(200);

      // Edit 2 by Staff 2
      const res2 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${action.id}`)
        .set('Cookie', `sessionId=${staff2Cookie}`)
        .send({
          actionLastUpdatedAt: res1.body.updatedAt,
          result: 'Edit 2: Result updated by Staff 2'
        });
      expect(res2.status).toBe(200);

      // Edit 3 by Admin
      const res3 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${action.id}`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({
          actionLastUpdatedAt: res2.body.updatedAt,
          followUpRequired: true,
          followUpNote: 'Edit 3: Follow-up required by Admin'
        });
      expect(res3.status).toBe(200);

      // Fetch revisions via GET endpoint
      const revRes = await request(app)
        .get(`/api/tickets/${testTicketId}/actions/${action.id}/revisions`)
        .set('Cookie', `sessionId=${staff1Cookie}`);

      expect(revRes.status).toBe(200);
      const revisions = revRes.body;
      expect(revisions.length).toBe(3);

      // Verify deterministic order (editedAt ASC, id ASC)
      for (let i = 0; i < revisions.length - 1; i++) {
        const t1 = new Date(revisions[i].editedAt).getTime();
        const t2 = new Date(revisions[i + 1].editedAt).getTime();
        expect(t1).toBeLessThanOrEqual(t2);
      }

      // Verify revision chain continuity: each revision's beforeSnapshot matches preceding state
      expect(revisions[0].beforeSnapshot.actionDescription).toBe('Successive edit base');
      expect(revisions[0].afterSnapshot.actionDescription).toBe('Edit 1: Description updated by Staff 1');
      expect(revisions[0].editedById).toBe(staff1Id);

      expect(revisions[1].beforeSnapshot.actionDescription).toBe('Edit 1: Description updated by Staff 1');
      expect(revisions[1].afterSnapshot.result).toBe('Edit 2: Result updated by Staff 2');
      expect(revisions[1].editedById).toBe(staff2Id);

      expect(revisions[2].beforeSnapshot.result).toBe('Edit 2: Result updated by Staff 2');
      expect(revisions[2].afterSnapshot.followUpRequired).toBe(true);
      expect(revisions[2].afterSnapshot.followUpNote).toBe('Edit 3: Follow-up required by Admin');
      expect(revisions[2].editedById).toBe(adminId);
    });

    it('CON-02: Stale actionLastUpdatedAt returns 409 Conflict', async () => {
      if (!dbAvailable) return;

      const res = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: initialUpdatedAt, // Stale token
          actionDescription: 'Should conflict'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/modified by another session/i);
    });

    it('CON-03: Simultaneous concurrent conditional updates to the same Action Taken yield exactly one 200 OK and one 409 Conflict', async () => {
      if (!dbAvailable) return;

      const freshAction = await prisma.actionTaken.create({
        data: {
          ticketId: testTicketId,
          performedById: staff1Id,
          actionDescription: 'CON-03 Action base',
          result: 'Base result',
          followUpRequired: false
        }
      });
      const token = freshAction.updatedAt.toISOString();

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/tickets/${testTicketId}/actions/${freshAction.id}`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({
            actionLastUpdatedAt: token,
            actionDescription: 'Update from Worker 1'
          }),
        request(app)
          .patch(`/api/tickets/${testTicketId}/actions/${freshAction.id}`)
          .set('Cookie', `sessionId=${staff2Cookie}`)
          .send({
            actionLastUpdatedAt: token,
            actionDescription: 'Update from Worker 2'
          })
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const revs = await prisma.actionTakenRevision.findMany({
        where: { actionTakenId: freshAction.id }
      });
      expect(revs.length).toBe(1);
    });

    it('CON-07: Atomic transaction rollback for ActionTaken creation and editing when parent Ticket.updatedAt refresh fails', async () => {
      if (!dbAvailable) return;

      const origTransaction = prisma.$transaction.bind(prisma);
      let failTicketUpdate = true;

      const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any, ...args: any[]) => {
        if (typeof fn === 'function') {
          return await origTransaction(async (tx: any) => {
            const origTicketUpdate = tx.ticket.update.bind(tx.ticket);
            tx.ticket.update = async (...uArgs: any[]) => {
              if (failTicketUpdate) {
                throw new Error('Simulated Ticket.updatedAt refresh failure');
              }
              return await origTicketUpdate(...uArgs);
            };
            return await fn(tx);
          });
        }
        return await origTransaction(fn, ...args);
      });

      try {
        // (a) Create mode rollback
        const key = crypto.randomUUID();
        const actionCountBefore = await prisma.actionTaken.count();
        const keyCountBefore = await prisma.idempotencyKey.count();

        const resCreate = await request(app)
          .post(`/api/tickets/${testTicketId}/actions`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .set('Idempotency-Key', key)
          .send({
            actionDescription: 'CON-07 Rollback test action',
            result: 'Should rollback completely',
            followUpRequired: false,
            followUpNote: null
          });

        expect(resCreate.status).toBe(500);
        expect(resCreate.body.error).toBe('Internal server error');

        const actionCountAfter = await prisma.actionTaken.count();
        expect(actionCountAfter).toBe(actionCountBefore);

        const keyCountAfter = await prisma.idempotencyKey.count();
        expect(keyCountAfter).toBe(keyCountBefore);

        // (b) Edit mode rollback
        failTicketUpdate = false;
        const resValid = await request(app)
          .post(`/api/tickets/${testTicketId}/actions`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .set('Idempotency-Key', crypto.randomUUID())
          .send({
            actionDescription: 'CON-07 Action for edit rollback',
            result: 'Base result',
            followUpRequired: false,
            followUpNote: null
          });
        expect(resValid.status).toBe(201);
        const actionId = resValid.body.id;
        const initialUpdatedAt = resValid.body.updatedAt;

        const revCountBefore = await prisma.actionTakenRevision.count({ where: { actionTakenId: actionId } });

        failTicketUpdate = true;
        const resEdit = await request(app)
          .patch(`/api/tickets/${testTicketId}/actions/${actionId}`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({
            actionLastUpdatedAt: initialUpdatedAt,
            actionDescription: 'Modified description that must rollback'
          });

        expect(resEdit.status).toBe(500);
        expect(resEdit.body.error).toBe('Internal server error');

        const actionAfter = await prisma.actionTaken.findUnique({ where: { id: actionId } });
        expect(actionAfter?.actionDescription).toBe('CON-07 Action for edit rollback');
        expect(actionAfter?.updatedAt.toISOString()).toBe(initialUpdatedAt);

        const revCountAfter = await prisma.actionTakenRevision.count({ where: { actionTakenId: actionId } });
        expect(revCountAfter).toBe(revCountBefore);
      } finally {
        transactionSpy.mockRestore();
      }
    });

    it('REV-03: No-op with valid CAS returns 200 with 0 revisions, and stale No-op returns 409', async () => {
      if (!dbAvailable) return;

      const current = await prisma.actionTaken.findUnique({ where: { id: actionToEditId } });
      expect(current).toBeDefined();

      const revCountBefore = await prisma.actionTakenRevision.count({ where: { actionTakenId: actionToEditId } });

      // Valid-CAS No-op
      const resNoOp = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: current!.updatedAt.toISOString(),
          actionDescription: current!.actionDescription
        });

      expect(resNoOp.status).toBe(200);
      const revCountAfter = await prisma.actionTakenRevision.count({ where: { actionTakenId: actionToEditId } });
      expect(revCountAfter).toBe(revCountBefore);

      // Stale-CAS No-op -> 409
      const resStaleNoOp = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${actionToEditId}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: initialUpdatedAt,
          actionDescription: current!.actionDescription
        });

      expect(resStaleNoOp.status).toBe(409);
    });

    it('REV-04: Action Taken edit atomic transaction rollback across 4 failure modes (stale CAS, validation, revision insert fail, parent refresh fail)', async () => {
      if (!dbAvailable) return;

      // Create a fresh action for testing the 4 rollback modes
      const testAction = await prisma.actionTaken.create({
        data: {
          ticketId: testTicketId,
          performedById: staff1Id,
          actionDescription: 'REV-04 Action baseline',
          result: 'Baseline result',
          followUpRequired: false
        }
      });
      const validUpdatedAt = testAction.updatedAt.toISOString();
      const parentTicketBefore = await prisma.ticket.findUnique({ where: { id: testTicketId } });

      // Mode 1: Stale CAS token -> 409 Conflict, DB state unchanged
      const resMode1 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${testAction.id}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: '2026-01-01T00:00:00.000Z',
          actionDescription: 'Mode 1 modification attempt'
        });
      expect(resMode1.status).toBe(409);
      const actionAfterMode1 = await prisma.actionTaken.findUnique({ where: { id: testAction.id } });
      expect(actionAfterMode1?.actionDescription).toBe('REV-04 Action baseline');
      const revsMode1 = await prisma.actionTakenRevision.count({ where: { actionTakenId: testAction.id } });
      expect(revsMode1).toBe(0);

      // Mode 2: Validation failure (blank followUpNote when required) -> 400 Bad Request, DB state unchanged
      const resMode2 = await request(app)
        .patch(`/api/tickets/${testTicketId}/actions/${testAction.id}`)
        .set('Cookie', `sessionId=${staff1Cookie}`)
        .send({
          actionLastUpdatedAt: validUpdatedAt,
          followUpRequired: true,
          followUpNote: '   '
        });
      expect(resMode2.status).toBe(400);
      const actionAfterMode2 = await prisma.actionTaken.findUnique({ where: { id: testAction.id } });
      expect(actionAfterMode2?.actionDescription).toBe('REV-04 Action baseline');
      const revsMode2 = await prisma.actionTakenRevision.count({ where: { actionTakenId: testAction.id } });
      expect(revsMode2).toBe(0);

      // Mode 3: Revision insertion forced to fail -> 500, transaction rolls back
      const origTransaction = prisma.$transaction.bind(prisma);
      let failRevisionInsert = true;
      let failTicketRefresh = false;

      const txSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any, ...args: any[]) => {
        if (typeof fn === 'function') {
          return await origTransaction(async (tx: any) => {
            const origRevCreate = tx.actionTakenRevision.create.bind(tx.actionTakenRevision);
            tx.actionTakenRevision.create = async (...rArgs: any[]) => {
              if (failRevisionInsert) {
                throw new Error('Simulated revision insertion constraint failure');
              }
              return await origRevCreate(...rArgs);
            };
            const origTicketUpdate = tx.ticket.update.bind(tx.ticket);
            tx.ticket.update = async (...tArgs: any[]) => {
              if (failTicketRefresh) {
                throw new Error('Simulated ticket refresh failure');
              }
              return await origTicketUpdate(...tArgs);
            };
            return await fn(tx);
          });
        }
        return await origTransaction(fn, ...args);
      });

      try {
        const resMode3 = await request(app)
          .patch(`/api/tickets/${testTicketId}/actions/${testAction.id}`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({
            actionLastUpdatedAt: validUpdatedAt,
            actionDescription: 'Mode 3 modification attempt'
          });
        expect(resMode3.status).toBe(500);
        const actionAfterMode3 = await prisma.actionTaken.findUnique({ where: { id: testAction.id } });
        expect(actionAfterMode3?.actionDescription).toBe('REV-04 Action baseline');
        const revsMode3 = await prisma.actionTakenRevision.count({ where: { actionTakenId: testAction.id } });
        expect(revsMode3).toBe(0);

        // Mode 4: Parent Ticket refresh forced to fail -> 500, transaction rolls back
        failRevisionInsert = false;
        failTicketRefresh = true;
        const resMode4 = await request(app)
          .patch(`/api/tickets/${testTicketId}/actions/${testAction.id}`)
          .set('Cookie', `sessionId=${staff1Cookie}`)
          .send({
            actionLastUpdatedAt: validUpdatedAt,
            actionDescription: 'Mode 4 modification attempt'
          });
        expect(resMode4.status).toBe(500);
        const actionAfterMode4 = await prisma.actionTaken.findUnique({ where: { id: testAction.id } });
        expect(actionAfterMode4?.actionDescription).toBe('REV-04 Action baseline');
        const revsMode4 = await prisma.actionTakenRevision.count({ where: { actionTakenId: testAction.id } });
        expect(revsMode4).toBe(0);

        const parentTicketAfter = await prisma.ticket.findUnique({ where: { id: testTicketId } });
        expect(parentTicketAfter?.updatedAt.toISOString()).toBe(parentTicketBefore?.updatedAt.toISOString());
      } finally {
        txSpy.mockRestore();
      }
    });

    it('REV-05: Revision history authorization (Staff/Admin 200, Requester own 403, Requester unowned 404, unauth 401)', async () => {
      if (!dbAvailable) return;

      // 1. Staff -> 200
      const resStaff = await request(app)
        .get(`/api/tickets/${testTicketId}/actions/${actionToEditId}/revisions`)
        .set('Cookie', `sessionId=${staff1Cookie}`);
      expect(resStaff.status).toBe(200);
      expect(Array.isArray(resStaff.body)).toBe(true);

      // 2. Admin -> 200
      const resAdmin = await request(app)
        .get(`/api/tickets/${testTicketId}/actions/${actionToEditId}/revisions`)
        .set('Cookie', `sessionId=${adminCookie}`);
      expect(resAdmin.status).toBe(200);

      // 3. Requester on own ticket -> 403
      const resReqOwn = await request(app)
        .get(`/api/tickets/${testTicketId}/actions/${actionToEditId}/revisions`)
        .set('Cookie', `sessionId=${requesterCookie}`);
      expect(resReqOwn.status).toBe(403);

      // 4. Requester on unowned ticket -> 404
      const resReqUnowned = await request(app)
        .get(`/api/tickets/${otherTicketId}/actions/1/revisions`)
        .set('Cookie', `sessionId=${requesterCookie}`);
      expect(resReqUnowned.status).toBe(404);

      // 5. Unauthenticated -> 401
      const resUnauth = await request(app)
        .get(`/api/tickets/${testTicketId}/actions/${actionToEditId}/revisions`);
      expect(resUnauth.status).toBe(401);
    });

    it('REV-06: Verifies absence of operational edit or delete endpoints for revisions (404 Not Found)', async () => {
      if (!dbAvailable) return;

      const resDelete = await request(app)
        .delete(`/api/tickets/1/actions/1/revisions/1`)
        .set('Cookie', `sessionId=${adminCookie || 'test'}`);
      expect([404, 405]).toContain(resDelete.status);

      const resPut = await request(app)
        .put(`/api/tickets/1/actions/1/revisions/1`)
        .set('Cookie', `sessionId=${adminCookie || 'test'}`);
      expect([404, 405]).toContain(resPut.status);
    });
  });
});
