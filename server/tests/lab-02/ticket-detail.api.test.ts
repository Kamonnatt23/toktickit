import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { authService } from '../../src/services/auth.service.js';

describe('GET /api/tickets/:id', () => {
  let requesterId: number; let sessionCookie: string;
  let otherRequesterId: number; let otherSessionCookie: string;
  let categoryId: number;
  let systemId: number;
  let myTicketId: number;
  let otherTicketId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Detail Cat ' + Date.now() } });
    categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Detail Sys ' + Date.now() } });
    systemId = sys.id;

    const reqUser = await getPrisma().user.create({ data: { name: 'Detail Tester', email: 't_' + Date.now() + 'detail1' + Date.now() + '@test.com', requiresPasswordChange: false } });
    
    requesterId = reqUser.id;
    sessionCookie = await authService.createSession(requesterId);

    const reqUser2 = await getPrisma().user.create({ data: { name: 'Detail Tester 2', email: 't2_' + Date.now() + 'detail2' + Date.now() + '@test.com', requiresPasswordChange: false } });
    
    otherRequesterId = reqUser2.id;
    otherSessionCookie = await authService.createSession(otherRequesterId);

    const t1 = await getPrisma().ticket.create({
      data: { categoryId, relatedSystemId: systemId, requesterId, summary: 'My ticket', priority: 'High', description: 'My desc', status: 'New' }
    });
    myTicketId = t1.id;

    const t2 = await getPrisma().ticket.create({
      data: { categoryId, relatedSystemId: systemId, requesterId: otherRequesterId, summary: 'Other ticket', priority: 'Low', description: 'Other desc', status: 'New' }
    });
    otherTicketId = t2.id;
  });

  afterAll(async () => {
    //{ where: { id: { in: [myTicketId, otherTicketId] } } });
    //{ where: { id: { in: [requesterId, otherRequesterId] } } });
    //{ where: { id: categoryId } });
    //{ where: { id: systemId } });
  });

  it('requires X-Requester-Id header', async () => {
    const res = await request(app).get('/api/tickets/' + myTicketId);
    expect(res.status).toBe(401);
  });

  it('returns 401 if X-Requester-Id is invalid', async () => {
    const res = await request(app).get('/api/tickets/' + myTicketId).set('X-Requester-Id', 'not-a-number');
    expect(res.status).toBe(401);
  });

  it('returns 401 if requester does not exist', async () => {
    const res = await request(app).get('/api/tickets/' + myTicketId).set('X-Requester-Id', '99999');
    expect(res.status).toBe(401);
  });

  it('returns ticket if owner matches', async () => {
    const res = await request(app).get('/api/tickets/' + myTicketId).set("Cookie", `sessionId=${sessionCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('My ticket');
    expect(res.body).toHaveProperty('ticketNumber');
    expect(res.body.category.name).toMatch(/Detail Cat/);
  });

  it('returns 404 Not Found if accessing someone elses ticket', async () => {
    // Requester A (otherRequesterId) owns Ticket A (otherTicketId)
    // Requester B (requesterId) requests Ticket A
    const res = await request(app).get('/api/tickets/' + otherTicketId)
      .set("Cookie", `sessionId=${sessionCookie}`)
      .set("X-Requester-Id", String(otherRequesterId)); // Try to spoof identity
    
    // Assert response is 404 Not Found
    expect(res.status).toBe(404);
    
    // Assert Ticket A's data is not exposed
    expect(res.body).not.toHaveProperty('summary');
    expect(res.body).not.toHaveProperty('description');
    expect(res.body).not.toHaveProperty('ticketNumber');
    expect(res.body).toHaveProperty('error');
  });

  
  it('allows IT Staff to view any ticket', async () => {
    const staffUser = await getPrisma().user.create({ data: { name: 'Staff', email: 'staff' + Date.now() + '@test.com', role: 'IT Staff', requiresPasswordChange: false } });
    const staffCookie = await authService.createSession(staffUser.id);
    const res = await request(app).get('/api/tickets/' + myTicketId).set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(200);
  });

  it('allows Administrator to view any ticket', async () => {
    const adminUser = await getPrisma().user.create({ data: { name: 'Admin', email: 'admin' + Date.now() + '@test.com', role: 'Administrator', requiresPasswordChange: false } });
    const adminCookie = await authService.createSession(adminUser.id);
    const res = await request(app).get('/api/tickets/' + myTicketId).set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
  });


  it('returns 404 if ticket does not exist', async () => {
    const res = await request(app).get('/api/tickets/999999').set("Cookie", `sessionId=${sessionCookie}`);
    expect(res.status).toBe(404);
  });
});
