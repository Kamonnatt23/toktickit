import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { getPrisma } from '../../src/prisma.js';
import bcrypt from 'bcrypt';

describe('Admin User Management API', () => {
  let adminCookie: string;
  let adminId: number;
  let staffCookie: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('password123', 10);
    const timestamp = Date.now() + Math.random().toString().slice(2, 8);
    
    const adminUser = await getPrisma().user.create({
      data: { name: 'Admin User', email: `admin_${timestamp}@test.com`, passwordHash: hash, role: 'Administrator', isActive: true, requiresPasswordChange: false }
    });
    adminId = adminUser.id;

    const staffUser = await getPrisma().user.create({
      data: { name: 'Staff User', email: `staff_${timestamp}@test.com`, passwordHash: hash, role: 'IT Staff', isActive: true, requiresPasswordChange: false }
    });

    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    };

    adminCookie = await login(adminUser.email);
    staffCookie = await login(staffUser.email);
  });

  afterAll(async () => {
    // Tests are isolated by unique emails, skip complex cascade cleanup to avoid cross-test foreign key issues.
  });

  it('GET /api/admin/users: allows Administrator to list users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', `sessionId=${adminCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/admin/users: prevents non-Administrator from listing users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', `sessionId=${staffCookie}`);
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/users: creates a new user', async () => {
    const timestamp = Date.now();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({
        name: 'New User',
        email: `new${timestamp}@test.com`,
        role: 'Requester',
        initialPassword: 'temp'
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New User');
    expect(res.body.requiresPasswordChange).toBe(true);
  });

  it('ADMIN-01: Admin creates user with duplicate email returns 409', async () => {
    const timestamp = Date.now();
    const email = `dup${timestamp}@test.com`;
    await request(app)
      .post('/api/admin/users')
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ name: 'User 1', email, role: 'Requester', initialPassword: '123' });
      
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ name: 'User 2', email, role: 'Requester', initialPassword: '123' });
    expect(res.status).toBe(409);
  });

  it('ADMIN-02: Admin attempts self-deactivation returns 400', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot deactivate your own account/i);
  });

  it('PATCH /api/admin/users/:id: allows Admin to edit another user', async () => {
    const timestamp = Date.now();
    const newUser = await getPrisma().user.create({
      data: { name: 'Edit Me', email: `edit${timestamp}@test.com`, passwordHash: 'hash', role: 'Requester', isActive: true, requiresPasswordChange: false }
    });
    
    const res = await request(app)
      .patch(`/api/admin/users/${newUser.id}`)
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ name: 'Edited', role: 'IT Staff' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Edited');
    expect(res.body.role).toBe('IT Staff');
  });

  it('POST /api/admin/users/:id/reset-password: resets password', async () => {
    const timestamp = Date.now();
    const newUser = await getPrisma().user.create({
      data: { name: 'Reset Me', email: `reset${timestamp}@test.com`, passwordHash: 'oldhash', role: 'Requester', isActive: true, requiresPasswordChange: false }
    });
    
    const res = await request(app)
      .post(`/api/admin/users/${newUser.id}/reset-password`)
      .set('Cookie', `sessionId=${adminCookie}`)
      .send({ newPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    
    const dbUser = await getPrisma().user.findUnique({ where: { id: newUser.id } });
    expect(dbUser?.requiresPasswordChange).toBe(true);
  });
});
