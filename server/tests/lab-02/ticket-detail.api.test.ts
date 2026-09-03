import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

describe('GET /api/tickets/:id', () => {
  let requesterId: number;
  let otherRequesterId: number;
  let categoryId: number;
  let systemId: number;
  let myTicketId: number;
  let otherTicketId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Detail Cat ' + Date.now() } });
    categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Detail Sys ' + Date.now() } });
    systemId = sys.id;

    const reqUser = await getPrisma().requesterUser.create({ data: { name: 'Detail Tester', email: 'detail1' + Date.now() + '@test.com' } });
    requesterId = reqUser.id;

    const reqUser2 = await getPrisma().requesterUser.create({ data: { name: 'Detail Tester 2', email: 'detail2' + Date.now() + '@test.com' } });
    otherRequesterId = reqUser2.id;

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
    await getPrisma().ticket.deleteMany({ where: { id: { in: [myTicketId, otherTicketId] } } });
    await getPrisma().requesterUser.deleteMany({ where: { id: { in: [requesterId, otherRequesterId] } } });
    await getPrisma().category.delete({ where: { id: categoryId } });
    await getPrisma().relatedSystem.delete({ where: { id: systemId } });
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
    const res = await request(app).get('/api/tickets/' + myTicketId).set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('My ticket');
    expect(res.body).toHaveProperty('ticketNumber');
    expect(res.body.category.name).toMatch(/Detail Cat/);
  });

  it('returns 403 Forbidden if accessing someone elses ticket', async () => {
    const res = await request(app).get('/api/tickets/' + otherTicketId).set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(403);
  });

  it('returns 404 if ticket does not exist', async () => {
    const res = await request(app).get('/api/tickets/999999').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(404);
  });
});
