import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';

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
    const tickets = await getPrisma().ticket.findMany({ where: { requesterId: { in: [requesterId, otherRequesterId] } } });
    const ticketIds = tickets.map(t => t.id);
    await getPrisma().attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await getPrisma().ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await getPrisma().requesterUser.deleteMany({ where: { id: { in: [requesterId, otherRequesterId] } } });
    await getPrisma().relatedSystem.deleteMany({ where: { name: { startsWith: 'Att Sys ' } } });
    await getPrisma().category.deleteMany({ where: { name: { startsWith: 'Att Cat ' } } });
  });

  it('rejects upload if missing ticketId', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('fake'), 'test.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ticketId is required/);
  });

  it('rejects upload if missing X-Requester-Id', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('test'), 'test.png');
    expect(res.status).toBe(401);
  });

  it('rejects non-owner upload', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(otherRequesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('fake'), 'test.png');
    expect(res.status).toBe(403);
  });

  it('uploads a file successfully', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('fake image content'), 'test.png');
    
    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe('test.png');
    expect(res.body.id).toBeDefined();
  });

  it('rejects invalid file types and mismatched extensions', async () => {
    // Unsupported extension
    const res1 = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('test'), 'test.exe');
    expect(res1.status).toBe(400);

    // Mismatched MIME and extension
    const res2 = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('test'), { filename: 'test.txt', contentType: 'image/png' });
    expect(res2.status).toBe(400);
  });

  it('allows exactly 5 MB file', async () => {
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024, 'a');
    const res = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', bigBuffer, 'big.pdf');
    expect(res.status).toBe(201);
  });

  it('downloads an attachment', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('download me'), 'dl.pdf');
    
    const attId = uploadRes.body.id;
    
    const dlRes = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set('X-Requester-Id', String(requesterId));
    expect(dlRes.status).toBe(200);
  });

  it('rejects empty removal reason', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('remove me'), 'rm-empty.pdf');
    
    const attId = uploadRes.body.id;
    const delRes = await request(app)
      .delete(`/api/attachments/${attId}`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: '   ' });
    expect(delRes.status).toBe(400);
  });

  it('soft removes an attachment and keeps metadata in ticket detail', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('remove me'), 'rm.pdf');
    
    const attId = uploadRes.body.id;

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

    // Fetch ticket detail and check metadata
    const ticketRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('X-Requester-Id', String(requesterId));
    expect(ticketRes.status).toBe(200);
    const removedAtt = ticketRes.body.attachments.find((a: any) => a.id === attId);
    expect(removedAtt).toBeDefined();
    expect(removedAtt.isDeleted).toBe(true);
    expect(removedAtt.removalReason).toBe('mistake');
  });

  it('enforces max 5 active attachments independently', async () => {
    // Create a new independent ticket
    const cat = await getPrisma().category.findFirst();
    const sys = await getPrisma().relatedSystem.findFirst();
    const newTicket = await getPrisma().ticket.create({
      data: { 
        categoryId: cat!.id, 
        relatedSystemId: sys!.id, 
        requesterId, 
        summary: '5 attachment limit test', 
        priority: 'Medium', 
        description: 'Testing limits' 
      }
    });
    
    // Upload 5 attachments
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/attachments')
        .set('X-Requester-Id', String(requesterId))
        .field('ticketId', newTicket.id)
        .attach('file', Buffer.from(`content \${i}`), `file\${i}.pdf`);
      expect(res.status).toBe(201);
    }

    // 6th upload should fail
    const res6 = await request(app)
      .post('/api/attachments')
      .set('X-Requester-Id', String(requesterId))
      .field('ticketId', newTicket.id)
      .attach('file', Buffer.from('6th'), 'six.pdf');
    expect(res6.status).toBe(400);
    expect(res6.body.error).toMatch(/5 attachments/);
  });
});
