import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import path from 'path';
import fs from 'fs';

describe('Attachments API', () => {
  let requesterId: number;
  let otherRequesterId: number;
  let ticketId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Att Cat ' + Date.now() } });
    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Att Sys ' + Date.now() } });

    const reqUser = await getPrisma().requesterUser.create({ data: { name: 'Att Tester', email: 'att1' + Date.now() + '@test.com' } });
    requesterId = reqUser.id;

    const reqUser2 = await getPrisma().requesterUser.create({ data: { name: 'Att Tester 2', email: 'att2' + Date.now() + '@test.com' } });
    otherRequesterId = reqUser2.id;

    const t = await getPrisma().ticket.create({
      data: { categoryId: cat.id, relatedSystemId: sys.id, requesterId, summary: 'T', priority: 'High', description: 'D' }
    });
    ticketId = t.id;
  });

  afterAll(async () => {
    await getPrisma().attachment.deleteMany({ where: { ticketId } });
    await getPrisma().ticket.deleteMany({ where: { id: ticketId } });
    await getPrisma().requesterUser.deleteMany({ where: { id: { in: [requesterId, otherRequesterId] } } });
    await getPrisma().relatedSystem.deleteMany({ where: { name: { startsWith: 'Att Sys ' } } });
    await getPrisma().category.deleteMany({ where: { name: { startsWith: 'Att Cat ' } } });
  });

  it('rejects upload if missing X-Requester-Id', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .attach('file', Buffer.from('test'), 'test.png');
    expect(res.status).toBe(401);
  });

  it('uploads a file successfully', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('fake image content'), 'test.png');
    
    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe('test.png');
    expect(res.body.id).toBeDefined();
  });

  it('rejects invalid file types', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('test'), 'test.exe');
    
    expect(res.status).toBe(400);
  });

  it('downloads an attachment', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('download me'), 'down.png');
    
    const attId = uploadRes.body.id;

    const dlRes = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set('X-Requester-Id', String(requesterId));
    
    expect(dlRes.status).toBe(200);
  });

  it('soft removes an attachment', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('delete me'), 'del.png');
    
    const attId = uploadRes.body.id;

    // Attach to ticket so we can test ownership
    await getPrisma().attachment.update({ where: { id: attId }, data: { ticketId } });

    // Try deleting as wrong user
    const delResFail = await request(app)
      .delete(`/api/attachments/${attId}`)
      .set('X-Requester-Id', String(otherRequesterId));
    expect(delResFail.status).toBe(403);

    // Try downloading as wrong user
    const dlResFail = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set('X-Requester-Id', String(otherRequesterId));
    expect(dlResFail.status).toBe(403);

    // Delete as owner
    const delRes = await request(app)
      .delete(`/api/attachments/${attId}`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'mistake' });
    expect(delRes.status).toBe(204);

    // Try downloading after delete
    const dlResDeleted = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set('X-Requester-Id', String(requesterId));
    expect(dlResDeleted.status).toBe(404);
  });
});
