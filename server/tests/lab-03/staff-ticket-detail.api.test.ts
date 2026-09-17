
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
    it('allows IT Staff to assign ticket to another IT Staff', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/assign`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ ownerId: staff2Id });

      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBe(staff2Id);
    });

    it('rejects unauthenticated requests', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app).patch(`/api/staff/tickets/${ticket.id}/assign`).send({ ownerId: staff2Id });
      expect(res.status).toBe(401);
    });

    it('rejects Requester and Administrator', async () => {
      const ticket = await createTicket('New', null);
      let res = await request(app).patch(`/api/staff/tickets/${ticket.id}/assign`).set('Cookie', `sessionId=${requesterCookie}`).send({ ownerId: staff2Id });
      expect(res.status).toBe(403);

      res = await request(app).patch(`/api/staff/tickets/${ticket.id}/assign`).set('Cookie', `sessionId=${adminCookie}`).send({ ownerId: staff2Id });
      expect(res.status).toBe(403);
    });

    it('rejects assignment to inactive or non-IT Staff', async () => {
      const ticket = await createTicket('New', null);

      // Inactive
      let res = await request(app).patch(`/api/staff/tickets/${ticket.id}/assign`).set('Cookie', `sessionId=${staffCookie1}`).send({ ownerId: inactiveStaffId });
      expect(res.status).toBe(400);

      // Administrator
      res = await request(app).patch(`/api/staff/tickets/${ticket.id}/assign`).set('Cookie', `sessionId=${staffCookie1}`).send({ ownerId: adminId });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/staff/tickets/:id/status', () => {
    it('allows updating IT Priority only', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ itPriority: 'Critical' });

      expect(res.status).toBe(200);
      expect(res.body.itPriority).toBe('Critical');
      expect(res.body.status).toBe('New'); // unchanged
    });

    it('rejects invalid IT Priority', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ itPriority: 'SuperHigh' });

      expect(res.status).toBe(400);
    });

    it('rejects transitions that do not follow the matrix', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved' }); // New to Resolved directly is invalid

      expect(res.status).toBe(400);
    });

    it('requires owner for New -> Open', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Open' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/claimed\/assigned/i);
    });

    it('New -> Open success with owner', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Open' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Open');
    });

    it('requires reason for New -> Cancelled', async () => {
      const ticket = await createTicket('New', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Cancelled' });

      expect(res.status).toBe(400);
    });

    it('New -> Cancelled success with reason', async () => {
      const ticket = await createTicket('New', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Cancelled', reason: 'Spam ticket' });

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
        .send({ status: 'Waiting for Requester' });

      expect(res.status).toBe(400);
    });

    it('In Progress -> Waiting for Requester success with comment', async () => {
      const ticket = await createTicket('In Progress', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Waiting for Requester', comment: 'Need more info' });

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
        .send({ status: 'Open' });
      expect(res.status).toBe(403);

      res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${adminCookie}`)
        .send({ status: 'Open' });
      expect(res.status).toBe(403);
    });

    it('rejects IT Staff from transitioning Resolved to Reopened', async () => {
      const ticket = await createTicket('Resolved', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Reopened' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid transition/);
    });

    it('allows IT Staff to transition Closed to Reopened', async () => {
      const ticket = await createTicket('Closed', staff1Id);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Reopened' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Reopened');
    });

    it('requires assignment for Open -> In Progress', async () => {
      const ticket = await createTicket('Open', null);
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'In Progress' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assigned/);
    });

    it('In Progress -> Resolved without comment fails', async () => {
      const ticket = await createTicket('In Progress', staff1Id);

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved' }); // missing comment

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

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set('Cookie', `sessionId=${staffCookie1}`)
        .send({ status: 'Resolved', comment: 'Resolution details here' });

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
        .send({ ownerId: 0 });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/active IT Staff/);

      // Verify ownerId remains unchanged
      const updatedTicket = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(updatedTicket?.ownerId).toBeNull();
    });
  });
});
