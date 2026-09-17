import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';

describe('Comments and Notes API', () => {
  let requesterCookie: string;
  let staffCookie: string;
  let adminCookie: string;
  let reqId: number;
  let staffId: number;
  let adminId: number;

  beforeAll(async () => {
    // DO NOT wipe the database, just create dynamic users to prevent breaking database.test.ts

    const hash = await bcrypt.hash('password123', 10);
    const createDbUser = async (email: string, role: string) => {
      return await getPrisma().user.create({
        data: { name: email.split('@')[0], email, passwordHash: hash, role, isActive: true, requiresPasswordChange: false }
      });
    };

    const timestamp = Date.now() + Math.random().toString().slice(2, 8);
    const reqUser = await createDbUser(`req${timestamp}@test.com`, 'Requester');
    reqId = reqUser.id;
    const staffUser = await createDbUser(`staff${timestamp}@test.com`, 'IT Staff');
    staffId = staffUser.id;
    const adminUser = await createDbUser(`admin${timestamp}@test.com`, 'Administrator');
    adminId = adminUser.id;

    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    };

    requesterCookie = await login(`req${timestamp}@test.com`);
    staffCookie = await login(`staff${timestamp}@test.com`);
    adminCookie = await login(`admin${timestamp}@test.com`);
  });

  const createTicket = async (status: string, ownerId: number | null) => {
    return await getPrisma().ticket.create({
      data: {
        categoryId: 1, relatedSystemId: 1, summary: 'Test', description: 'Test', priority: 'Low',
        status, requesterId: reqId, ownerId
      }
    });
  };

  it('COMM-01, COMM-02: Public comment and Internal note immutability (append-only)', async () => {
    const ticket = await createTicket('In Progress', staffId);
    
    // Attempting to PATCH or DELETE doesn't even exist, but if we hit the endpoints they should return 404
    const resPatch = await request(app).patch(`/api/tickets/${ticket.id}/comments/1`).set('Cookie', `sessionId=${staffCookie}`);
    expect(resPatch.status).toBe(404);

    const resDel = await request(app).delete(`/api/tickets/${ticket.id}/notes/1`).set('Cookie', `sessionId=${staffCookie}`);
    expect(resDel.status).toBe(404);
  });

  it('COMM-03: Requester triggers Appears Resolved on In Progress ticket', async () => {
    const ticket = await createTicket('In Progress', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/appears-resolved`)
      .set('Cookie', `sessionId=${requesterCookie}`);
    
    expect(res.status).toBe(201);
    expect(res.body.content).toMatch(/appears resolved/i);
    expect(res.body.authorId).toBe(reqId);

    const updated = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('In Progress'); // Status unchanged
  });

  it('COMM-04: Requester triggers Appears Resolved on non-In Progress ticket fails', async () => {
    const ticket = await createTicket('Open', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/appears-resolved`)
      .set('Cookie', `sessionId=${requesterCookie}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/In Progress/i);
  });

  it('COMM-05: Requester posts comment on Waiting for Requester ticket auto-transitions to Open', async () => {
    const ticket = await createTicket('Waiting for Requester', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Cookie', `sessionId=${requesterCookie}`)
      .send({ content: 'Here is the info' });
    
    expect(res.status).toBe(201);
    const updated = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('Open');
  });

  it('COMM-06: Requester posts comment on Resolved ticket auto-transitions to Reopened', async () => {
    const ticket = await createTicket('Resolved', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Cookie', `sessionId=${requesterCookie}`)
      .send({ content: 'Still broken' });
    
    expect(res.status).toBe(201);
    const updated = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('Reopened');
  });


  it('COMM-07: IT Staff posts comment on Waiting for Requester ticket, status remains unchanged', async () => {
    const ticket = await createTicket('Waiting for Requester', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Cookie', `sessionId=${staffCookie}`)
      .send({ content: 'Are you there?' });
    
    expect(res.status).toBe(201);
    const updated = await getPrisma().ticket.findUnique({ where: { id: ticket.id } });
    expect(updated?.status).toBe('Waiting for Requester');
  });
  it('NOTE-01: Requester attempts to GET Internal Notes', async () => {
    const ticket = await createTicket('Open', staffId);
    const res = await request(app).get(`/api/tickets/${ticket.id}/notes`).set('Cookie', `sessionId=${requesterCookie}`);
    expect(res.status).toBe(403);
  });

  it('NOTE-02: Requester attempts to POST Internal Note', async () => {
    const ticket = await createTicket('Open', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/notes`)
      .set('Cookie', `sessionId=${requesterCookie}`)
      .send({ content: 'A note' });
    expect(res.status).toBe(403);
  });

  it('NOTE-03: Administrator attempts to GET Internal Notes', async () => {
    const ticket = await createTicket('Open', staffId);
    await getPrisma().internalNote.create({ data: { content: 'test', ticketId: ticket.id, authorId: staffId } });
    const res = await request(app).get(`/api/tickets/${ticket.id}/notes`).set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('NOTE-04: Administrator attempts to POST Internal Note', async () => {
    const ticket = await createTicket('Open', staffId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/notes`)
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ content: 'A note' });
    expect(res.status).toBe(403);
  });
});
