
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { getPrisma } from '../../src/prisma';
import { authService } from '../../src/services/auth.service.js';



describe('Staff Ticket Operations (Assign & Status)', () => {
  let staffCookie1: string;
  let staffCookie2: string;
  let adminCookie: string;
  let requesterCookie: string;

  let staff1Id: number;
  let staff2Id: number;
  let adminId: number;
  let requesterId: number;
  let inactiveStaffId: number;
  let categoryId: number;
  let systemId: number;

  let createdUserIds: number[] = [];
  let createdTicketIds: number[] = [];
  let createdCommentIds: number[] = [];
  let createdNoteIds: number[] = [];

  beforeAll(async () => {
    // Category & System
    const cat = await getPrisma().category.findFirst() || await getPrisma().category.create({ data: { name: 'Test Cat Detail ' + Date.now() } });
    categoryId = cat.id;
    const sys = await getPrisma().relatedSystem.findFirst() || await getPrisma().relatedSystem.create({ data: { name: 'Test Sys Detail ' + Date.now() } });
    systemId = sys.id;

    // Users
    const uReq = await getPrisma().user.create({ data: { name: 'Req User', email: 'req-dtl' + Date.now() + '@test.com', role: 'Requester', requiresPasswordChange: false } });
    requesterId = uReq.id;
    requesterCookie = await authService.createSession(uReq.id);
    createdUserIds.push(uReq.id);

    const uStaff1 = await getPrisma().user.create({ data: { name: 'Staff 1', email: 'staff1-dtl' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false } });
    staff1Id = uStaff1.id;
    staffCookie1 = await authService.createSession(uStaff1.id);
    createdUserIds.push(uStaff1.id);

    const uStaff2 = await getPrisma().user.create({ data: { name: 'Staff 2', email: 'staff2-dtl' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false } });
    staff2Id = uStaff2.id;
    staffCookie2 = await authService.createSession(uStaff2.id);
    createdUserIds.push(uStaff2.id);

    const uInactiveStaff = await getPrisma().user.create({ data: { name: 'Inactive Staff', email: 'instaff-dtl' + Date.now() + '@test.com', role: 'IT Staff', isActive: false } });
    inactiveStaffId = uInactiveStaff.id;
    createdUserIds.push(uInactiveStaff.id);

    const uAdmin = await getPrisma().user.create({ data: { name: 'Admin User', email: 'admin-dtl' + Date.now() + '@test.com', role: 'Administrator', requiresPasswordChange: false } });
    adminId = uAdmin.id;
    adminCookie = await authService.createSession(uAdmin.id);
    createdUserIds.push(uAdmin.id);
  });

  afterAll(async () => {
    await getPrisma().actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId: { in: createdTicketIds } } } });
    await getPrisma().actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await getPrisma().idempotencyKey.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await getPrisma().publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await getPrisma().internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await getPrisma().attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await getPrisma().ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await getPrisma().session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await getPrisma().user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  const createTicket = async (status = 'New', ownerId: number | null = null) => {
    const t = await getPrisma().ticket.create({
      data: {
        summary: 'Test ' + Date.now(),
        description: 'Testing detail',
        status,
        ownerId,
        categoryId,
        relatedSystemId: systemId,
        requesterId
      }
    });
    createdTicketIds.push(t.id);
    return t;
  };

  describe('PATCH /api/staff/tickets/:id/assign', () => {
    // 1. Valid current lastUpdatedAt permits assignment
    it('Case 1: Valid current lastUpdatedAt permits assignment', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBe(staff2Id);
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
    });

    // 2. Valid current lastUpdatedAt permits reassignment
    it('Case 2: Valid current lastUpdatedAt permits reassignment', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBe(staff2Id);
    });

    // 3. Valid current lastUpdatedAt permits unassignment (ownerId: null)
    it('Case 3: Valid current lastUpdatedAt permits unassignment (ownerId: null)', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: null, lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBeNull();

      const dbTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.ownerId).toBeNull();
    });

    // 4. Missing lastUpdatedAt returns 400
    it('Case 4: Missing lastUpdatedAt returns 400', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lastUpdatedAt is required');
    });

    // 5. Malformed or non-strict ISO timestamp returns 400
    it('Case 5: Malformed or non-strict ISO timestamp returns 400', async () => {
      const ticket = await createTicket('New', null);

      // Non-strict format (missing timezone)
      let res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: '2026-02-15 10:00:00' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lastUpdatedAt is required');

      // Malformed string
      res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: 'invalid-iso-string' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lastUpdatedAt is required');
    });

    // 6. Invalid calendar date returns 400
    it('Case 6: Invalid calendar date returns 400', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: '2026-02-30T10:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lastUpdatedAt is required');
    });

    // 7. Stale lastUpdatedAt returns 409
    it('Case 7: Stale lastUpdatedAt returns 409', async () => {
      const ticket = await createTicket('New', staff1Id);
      const staleToken = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Modify ticket to bump updatedAt
      await getPrisma().ticket.update({
        where: { id: ticket.id },
        data: { ownerId: staff2Id, updatedAt: new Date() }
      });

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff1Id, lastUpdatedAt: staleToken });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ticket was modified by another session');
    });

    // 8. A nonexistent Ticket returns 404
    it('Case 8: A nonexistent Ticket returns 404', async () => {
      const validIso = new Date().toISOString();
      const res = await request(app)
        .patch('/api/staff/tickets/999999/assign')
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: validIso });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Ticket not found');
    });

    // 9. A stale assignment request does not change the latest ownerId
    it('Case 9: A stale assignment request does not change the latest ownerId', async () => {
      const ticket = await createTicket('New', staff1Id);
      const staleToken = ticket.updatedAt.toISOString();

      await new Promise((r) => setTimeout(r, 25));

      // Staff 2 assigns to self
      await getPrisma().ticket.update({
        where: { id: ticket.id },
        data: { ownerId: staff2Id, updatedAt: new Date() }
      });

      // Staff 1 sends stale unassignment
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: null, lastUpdatedAt: staleToken });

      expect(res.status).toBe(409);

      // Verify DB ownerId remains staff2Id (not overwritten to null)
      const dbTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.ownerId).toBe(staff2Id);
    });

    // 10. Two assignment requests using the same timestamp but different owner IDs result in exactly one successful update and one 409 Conflict
    it('Case 10: Two assignment requests using the same timestamp result in exactly one 200 and one 409', async () => {
      const ticket = await createTicket('New', null);
      const token = ticket.updatedAt.toISOString();

      const reqA = request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff1Id, lastUpdatedAt: token });

      const reqB = request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie2}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: token });

      const [resA, resB] = await Promise.all([reqA, reqB]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Verify the ticket in DB has the owner from the winning request
      const winningOwner = resA.status === 200 ? staff1Id : staff2Id;
      const dbTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(dbTicket?.ownerId).toBe(winningOwner);
    });

    it('rejects unauthenticated requests', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .send({ ownerId: staff2Id, lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(res.status).toBe(401);
    });

    it('rejects Requester and Administrator', async () => {
      const ticket = await createTicket('New', null);
      const token = ticket.updatedAt.toISOString();
      let res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: token });
      expect(res.status).toBe(403);

      res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({ ownerId: staff2Id, lastUpdatedAt: token });
      expect(res.status).toBe(403);
    });

    it('rejects assignment to inactive or non-IT Staff', async () => {
      const ticket = await createTicket('New', null);
      const token = ticket.updatedAt.toISOString();

      // Inactive
      let res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: inactiveStaffId, lastUpdatedAt: token });
      expect(res.status).toBe(400);

      // Administrator
      res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: adminId, lastUpdatedAt: token });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/staff/tickets/:id/status', () => {
    it('allows updating IT Priority only', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ itPriority: 'Critical', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.itPriority).toBe('Critical');
      expect(res.body.status).toBe('New'); // unchanged
    });

    it('rejects invalid IT Priority', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ itPriority: 'SuperHigh', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
    });

    it('rejects transitions that do not follow the matrix', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() }); // New to Resolved directly is invalid

      expect(res.status).toBe(400);
    });

    it('requires owner for New -> Open', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assigned/i);
    });

    it('New -> Open success with owner', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Open');
    });

    it('requires reason for New -> Cancelled', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Cancelled', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
    });

    it('New -> Cancelled success with reason', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Cancelled', reason: 'Spam ticket', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);

      const notes = await getPrisma().internalNote.findMany({ where: { ticketId: ticket.id } });
      expect(notes.length).toBe(1);
      expect(notes[0].content).toMatch(/Spam ticket/);
    });

    it('requires public comment for In Progress -> Waiting for Requester', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Waiting for Requester', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
    });

    it('In Progress -> Waiting for Requester success with comment', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Waiting for Requester', comment: 'Need more info', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);

      const comments = await getPrisma().publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe('Need more info');
    });

    it('rejects Requester and Administrator for status updates', async () => {
      const ticket = await createTicket('New', staff1Id);

      let res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${requesterCookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(res.status).toBe(403);

      res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({ status: 'Open', lastUpdatedAt: ticket.updatedAt.toISOString() });
      expect(res.status).toBe(403);
    });

    it('rejects IT Staff from transitioning Resolved to Reopened', async () => {
      const ticket = await createTicket('Resolved', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Reopened', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid.*transition/i);
    });

    it('allows IT Staff to transition Closed to Reopened', async () => {
      const ticket = await createTicket('Closed', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Reopened', reason: 'Customer callback', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Reopened');
    });

    it('requires assignment for Open -> In Progress', async () => {
      const ticket = await createTicket('Open', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'In Progress', lastUpdatedAt: ticket.updatedAt.toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assigned/);
    });

    it('In Progress -> Resolved without comment fails', async () => {
      const ticket = await createTicket('In Progress', staff1Id);

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved', lastUpdatedAt: ticket.updatedAt.toISOString() }); // missing comment

      expect(res.status).toBe(400);

      // Ensure status unchanged
      const updatedTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(updatedTicket?.status).toBe('In Progress');

      // Ensure no comment created
      const comments = await getPrisma().publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(0);
    });

    it('In Progress -> Resolved with comment succeeds and creates PublicComment', async () => {
      const ticket = await createTicket('In Progress', staff1Id);

      // Create an action taken so ticket satisfies the Resolution Gate
      await getPrisma().actionTaken.create({
        data: {
          ticketId: ticket.id,
          performedById: staff1Id,
          actionDescription: 'Fixed issue',
          result: 'Resolved'
        }
      });
      const freshTicket = (await getPrisma().ticket.findUnique({ where: { id: ticket.id } }))!;

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved', comment: 'Resolution details here', lastUpdatedAt: freshTicket.updatedAt.toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Resolved');

      // Verify exactly the expected PublicComment is created
      const comments = await getPrisma().publicComment.findMany({ where: { ticketId: ticket.id } });
      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe('Resolution details here');
      expect(comments[0].authorId).toBe(staff1Id);
    });

    it('rejects assignment to ownerId 0', async () => {
      const ticket = await createTicket('New', null);
      
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: 0, lastUpdatedAt: ticket.updatedAt.toISOString() });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/active IT Staff/);

      // Verify ownerId remains unchanged
      const updatedTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(updatedTicket?.ownerId).toBeNull();
    });
  });
});
