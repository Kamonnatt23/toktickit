import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';
import { performance } from 'perf_hooks';

describe('Performance Smoke Benchmark (SMK-01)', () => {
  const prisma = getPrisma();

  let requesterCookie: string;
  let staffCookie: string;
  let adminCookie: string;

  let requesterId: number;
  let staffId: number;
  let adminId: number;

  const testUserIds: number[] = [];
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now().toString().slice(-6);
    const passwordHash = await bcrypt.hash('password123', 10);

    const createUser = async (email: string, role: string) => {
      const u = await prisma.user.create({
        data: {
          name: email.split('@')[0],
          email,
          passwordHash,
          role,
          isActive: true,
          requiresPasswordChange: false
        }
      });
      testUserIds.push(u.id);
      return u;
    };

    const req = await createUser(`perf-req-${suffix}@test.com`, 'Requester');
    requesterId = req.id;
    const staff = await createUser(`perf-staff-${suffix}@test.com`, 'IT Staff');
    staffId = staff.id;
    const admin = await createUser(`perf-adm-${suffix}@test.com`, 'Administrator');
    adminId = admin.id;

    const getSessionCookie = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0].split('=')[1] : '';
    };

    requesterCookie = await getSessionCookie(req.email);
    staffCookie = await getSessionCookie(staff.email);
    adminCookie = await getSessionCookie(admin.email);

    const cat = await prisma.category.findFirst() || await prisma.category.create({ data: { name: `PerfCat-${suffix}` } });
    const sys = await prisma.relatedSystem.findFirst() || await prisma.relatedSystem.create({ data: { name: `PerfSys-${suffix}` } });

    // Seed 105 tickets in the disposable test database
    const statuses = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Resolved', 'Closed', 'Reopened'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const now = new Date();

    const ticketsData = [];
    for (let i = 1; i <= 105; i++) {
      const status = statuses[i % statuses.length];
      const priority = priorities[i % priorities.length];
      const ownerId = i % 3 === 0 ? null : (i % 2 === 0 ? staffId : null);
      const isResolved = status === 'Resolved';
      const resolvedAt = isResolved ? new Date(now.getTime() - (i % 25) * 24 * 60 * 60 * 1000) : null;

      ticketsData.push({
        categoryId: cat.id,
        relatedSystemId: sys.id,
        summary: `Performance Benchmark Ticket #${i} - ${suffix}`,
        description: `Automated test fixture ticket ${i} for performance smoke testing`,
        priority,
        itPriority: priority,
        status,
        requesterId,
        ownerId,
        resolvedAt
      });
    }

    await prisma.ticket.createMany({
      data: ticketsData
    });

    const insertedTickets = await prisma.ticket.findMany({
      where: {
        requesterId,
        summary: { contains: `Performance Benchmark Ticket #` }
      },
      select: { id: true }
    });
    insertedTickets.forEach(t => createdTicketIds.push(t.id));
  });

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId: { in: createdTicketIds } } } });
      await prisma.actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (testUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    }
  });

  it('SMK-01: Benchmark Requester Dashboard query execution completes in < 500ms with 100+ seeded tickets', async () => {
    expect(createdTicketIds.length).toBeGreaterThanOrEqual(100);

    const start = performance.now();
    const res = await request(app)
      .get('/api/dashboard/requester')
      .set('Cookie', `sessionId=${requesterCookie}`);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.metrics.openTickets).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500);
  });

  it('SMK-01: Benchmark Staff Dashboard query execution completes in < 500ms with 100+ seeded tickets', async () => {
    const start = performance.now();
    const res = await request(app)
      .get('/api/dashboard/staff')
      .set('Cookie', `sessionId=${staffCookie}`);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.metrics.unassigned).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500);
  });

  it('SMK-01: Benchmark Administrator Dashboard query execution completes in < 500ms with 100+ seeded tickets', async () => {
    const start = performance.now();
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Cookie', `sessionId=${adminCookie}`);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.userStats.totalUsers).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500);
  });
});
