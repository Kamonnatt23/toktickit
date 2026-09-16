import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import { authService } from '../../src/services/auth.service.js';

describe('Attachments API', () => {
  let requesterId: number; let sessionCookie: string;
  let otherRequesterId: number; let otherSessionCookie: string;
  let ticketId: number;

  beforeAll(async () => {
    const cat = await getPrisma().category.create({ data: { name: 'Att Cat ' + Date.now() } });
    const sys = await getPrisma().relatedSystem.create({ data: { name: 'Att Sys ' + Date.now() } });

    const reqUser = await getPrisma().user.create({ data: { name: 'Att Tester', email: 't_' + Date.now() + 'att1' + Date.now() + '@test.com', requiresPasswordChange: false } });
    
    requesterId = reqUser.id;
    sessionCookie = await authService.createSession(requesterId);

    const reqUser2 = await getPrisma().user.create({ data: { name: 'Att Tester 2', email: 't2_' + Date.now() + 'att2' + Date.now() + '@test.com', requiresPasswordChange: false } });
    
    otherRequesterId = reqUser2.id;
    otherSessionCookie = await authService.createSession(otherRequesterId);

    const t = await getPrisma().ticket.create({
      data: { categoryId: cat.id, relatedSystemId: sys.id, requesterId, summary: 'T', priority: 'High', description: 'D' }
    });
    ticketId = t.id;
  });

  afterAll(async () => {
    const tickets = await getPrisma().ticket.findMany({ where: { requesterId: { in: [requesterId, otherRequesterId] } } });
    const ticketIds = tickets.map(t => t.id);
    //{ where: { ticketId: { in: ticketIds } } });
    //{ where: { id: { in: ticketIds } } });
    //{ where: { id: { in: [requesterId, otherRequesterId] } } });
    //{ where: { name: { startsWith: 'Att Sys ' } } });
    //{ where: { name: { startsWith: 'Att Cat ' } } });
  });

  it('rejects upload if missing ticketId', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
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
      .set("Cookie", `sessionId=${otherSessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('fake'), 'test.png');
    expect(res.status).toBe(403);
  });

  it('uploads a file successfully', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
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
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('test'), 'test.exe');
    expect(res1.status).toBe(400);

    // Mismatched MIME and extension
    const res2 = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('test'), { filename: 'test.txt', contentType: 'image/png' });
    expect(res2.status).toBe(400);
  });

  it('allows exactly 5 MB file', async () => {
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024, 'a');
    const res = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', bigBuffer, 'big.pdf');
    expect(res.status).toBe(201);
  });

  it('downloads an attachment', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('download me'), 'dl.pdf');
    
    const attId = uploadRes.body.id;
    
    const dlRes = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set("Cookie", `sessionId=${sessionCookie}`);
    expect(dlRes.status).toBe(200);
  });

  it('rejects empty removal reason', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('remove me'), 'rm-empty.pdf');
    
    const attId = uploadRes.body.id;
    const delRes = await request(app)
      .delete(`/api/attachments/${attId}`)
      .set("Cookie", `sessionId=${sessionCookie}`)
      .send({ removalReason: '   ' });
    expect(delRes.status).toBe(400);
  });

  it('soft removes an attachment and keeps metadata in ticket detail', async () => {
    const uploadRes = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', ticketId)
      .attach('file', Buffer.from('remove me'), 'rm.pdf');
    
    const attId = uploadRes.body.id;

    // Delete as owner
    const delRes = await request(app)
      .delete(`/api/attachments/${attId}`)
      .set("Cookie", `sessionId=${sessionCookie}`)
      .send({ removalReason: 'mistake' });
    expect(delRes.status).toBe(204);

    // Try downloading after delete
    const dlResDeleted = await request(app)
      .get(`/api/attachments/${attId}/download`)
      .set("Cookie", `sessionId=${sessionCookie}`);
    expect(dlResDeleted.status).toBe(404);

    // Fetch ticket detail and check metadata
    const ticketRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", `sessionId=${sessionCookie}`);
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
        .set("Cookie", `sessionId=${sessionCookie}`)
        .field('ticketId', newTicket.id)
        .attach('file', Buffer.from(`content \${i}`), `file\${i}.pdf`);
      expect(res.status).toBe(201);
    }

    // 6th upload should fail
    const res6 = await request(app)
      .post('/api/attachments')
      .set("Cookie", `sessionId=${sessionCookie}`)
      .field('ticketId', newTicket.id)
      .attach('file', Buffer.from('6th'), 'six.pdf');
    expect(res6.status).toBe(400);
    expect(res6.body.error).toMatch(/5 attachments/);
  });
});
