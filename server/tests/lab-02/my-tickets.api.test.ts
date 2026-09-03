import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

describe('GET /api/tickets', () => {
  let requesterId: number;
  let otherRequesterId: number;
  let categoryId: number;
  let systemId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Test Cat GET ' + Date.now() } });
    categoryId = cat.id;

    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Test Sys GET ' + Date.now() } });
    systemId = sys.id;

    const reqUser = await getPrisma().requesterUser.create({ data: { name: 'MyTickets Tester', email: 'mytickets' + Date.now() + '@test.com' } });
    requesterId = reqUser.id;

    const reqUser2 = await getPrisma().requesterUser.create({ data: { name: 'Other Tester', email: 'other' + Date.now() + '@test.com' } });
    otherRequesterId = reqUser2.id;

    await getPrisma().ticket.createMany({
      data: [
        { categoryId, relatedSystemId: systemId, requesterId, summary: 'Fix router', priority: 'High', description: 'Desc', status: 'New' },
        { categoryId, relatedSystemId: systemId, requesterId, summary: 'Email issue', priority: 'Medium', description: 'Desc', status: 'In Progress' },
        { categoryId, relatedSystemId: systemId, requesterId, summary: 'Network down', priority: 'Critical', description: 'Desc', status: 'New' }
      ]
    });

    await getPrisma().ticket.create({
      data: { categoryId, relatedSystemId: systemId, requesterId: otherRequesterId, summary: 'Secret ticket', priority: 'Low', description: 'Desc', status: 'New' }
    });
  });

  afterAll(async () => {
    await getPrisma().ticket.deleteMany({ where: { requesterId: { in: [requesterId, otherRequesterId] } } });
    await getPrisma().requesterUser.delete({ where: { id: requesterId } });
    await getPrisma().requesterUser.delete({ where: { id: otherRequesterId } });
    await getPrisma().category.delete({ where: { id: categoryId } });
    await getPrisma().relatedSystem.delete({ where: { id: systemId } });
  });

  it('requires X-Requester-Id header', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  it('returns only tickets for the active user', async () => {
    const res = await request(app).get('/api/tickets').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    const summaries = res.body.data.map((t: any) => t.summary);
    expect(summaries).not.toContain('Secret ticket');
    expect(res.body.data[0]).toHaveProperty('ticketNumber');
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/tickets?status=In Progress').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].summary).toBe('Email issue');
  });

  it('searches by summary', async () => {
    const res = await request(app).get('/api/tickets?search=router').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].summary).toBe('Fix router');
  });

  it('sorts tickets', async () => {
    const res = await request(app).get('/api/tickets?sortBy=priority&sortOrder=asc').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    const priorities = res.body.data.map((t: any) => t.priority);
    expect(priorities).toEqual(['Critical', 'High', 'Medium']);
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/tickets?limit=2&page=1').set('X-Requester-Id', String(requesterId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);

    const res2 = await request(app).get('/api/tickets?limit=2&page=2').set('X-Requester-Id', String(requesterId));
    expect(res2.body.data.length).toBe(1);
  });
});
