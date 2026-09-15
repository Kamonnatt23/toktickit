import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { PrismaClient } from '@prisma/client';
import { authService } from '../../src/services/auth.service.js';

const prisma = new PrismaClient();

describe('Lab 3 Authentication & Session API', () => {
  let activeUser: any;
  let inactiveUser: any;
  let originalPasswordHash: string;
  let originalRequiresPasswordChange: boolean;
  let testPassword = 'password123';
  let validCookie: string;

  beforeAll(async () => {
    // Relying on seed data
    activeUser = await prisma.user.findFirst({ where: { email: 'john@example.com' } });
    inactiveUser = await prisma.user.findFirst({ where: { email: 'inactive.req@example.com' } });
    
    // Save original state for restoration
    originalPasswordHash = activeUser.passwordHash;
    originalRequiresPasswordChange = activeUser.requiresPasswordChange;

    // Ensure John has password123 and requires password change
    testPassword = 'password123';
    const hash = await authService.hashPassword(testPassword);
    await prisma.user.update({
      where: { id: activeUser.id },
      data: { requiresPasswordChange: true, passwordHash: hash }
    });
  });

  afterAll(async () => {
    // Restore the seeded user's original state
    if (activeUser) {
      await prisma.user.update({
        where: { id: activeUser.id },
        data: {
          passwordHash: originalPasswordHash,
          requiresPasswordChange: originalRequiresPasswordChange
        }
      });

      // Cleanup any test-created sessions for this user
      await prisma.session.deleteMany({
        where: { userId: activeUser.id }
      });
    }

    if (inactiveUser) {
      await prisma.session.deleteMany({
        where: { userId: inactiveUser.id }
      });
    }

    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('fails with missing fields', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('fails safely with invalid email (generic 401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'unknown@example.com',
        password: testPassword
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials or account inactive');
    });

    it('fails safely with invalid password (generic 401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: activeUser.email,
        password: 'wrongpassword'
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials or account inactive');
    });

    it('fails safely with inactive account (generic 401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: inactiveUser.email,
        password: testPassword
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials or account inactive');
    });

    it('succeeds with valid credentials, sets HttpOnly cookie, does NOT leak tokenHash', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: activeUser.email,
        password: testPassword
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(activeUser.id);
      expect(res.body.requiresPasswordChange).toBe(true);
      expect(res.body.passwordHash).toBeUndefined();
      
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('sessionId=');
      expect(cookies[0]).toContain('HttpOnly');
      
      validCookie = cookies[0].split(';')[0].split('=')[1];
    });
  });

  describe('Session Verification & requiresPasswordChange logic', () => {
    it('blocks normal endpoints (e.g. /api/auth/me) when requiresPasswordChange is true', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `sessionId=${validCookie}`);
      
      // We expect 403 Forbidden with specific message
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Password change required');
    });

    it('allows /api/auth/change-password when requiresPasswordChange is true', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', `sessionId=${validCookie}`)
        .send({
          oldPassword: testPassword,
          newPassword: 'newPassword456'
        });
      
      expect(res.status).toBe(200);
      
      // Revert the password back for other tests or keep track of it
      testPassword = 'newPassword456';
    });

    it('allows normal endpoints after password is changed and safely strips sensitive data', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `sessionId=${validCookie}`);
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(activeUser.id);
      expect(res.body.requiresPasswordChange).toBe(false);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.tokenHash).toBeUndefined();
      expect(res.body.sessionId).toBeUndefined();
    });

    it('rejects completely invalid or missing session tokens', async () => {
      const resMissing = await request(app).get('/api/auth/me');
      expect(resMissing.status).toBe(401);

      const resInvalid = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'sessionId=invalid-garbage-token');
      expect(resInvalid.status).toBe(401);
    });

    it('updates lastActiveAt on valid activity', async () => {
      // Artificially push lastActiveAt to 1 hour ago
      const tokenHash = authService.hashToken(validCookie);
      await prisma.session.update({
        where: { tokenHash },
        data: { lastActiveAt: new Date(Date.now() - 3600000) }
      });
      
      const sessionBefore = await prisma.session.findUnique({ where: { tokenHash } });
      
      await request(app)
        .get('/api/auth/me')
        .set('Cookie', `sessionId=${validCookie}`);
        
      const sessionAfter = await prisma.session.findUnique({ where: { tokenHash } });
      expect(sessionAfter!.lastActiveAt.getTime()).toBeGreaterThan(sessionBefore!.lastActiveAt.getTime());
    });
  });

  describe('Session Expiration & Logout', () => {
    it('rejects expired session and deletes it', async () => {
      // Manually expire the exact session in DB
      const tokenHash = authService.hashToken(validCookie);
      const pastDate = new Date(Date.now() - (25 * 60 * 60 * 1000));
      
      await prisma.session.update({
        where: { tokenHash },
        data: { lastActiveAt: pastDate }
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `sessionId=${validCookie}`);
        
      expect(res.status).toBe(401);
      
      const sessionAfter = await prisma.session.findUnique({ where: { tokenHash } });
      expect(sessionAfter).toBeNull();
    });

    it('logs out and clears session', async () => {
      // Login again to get a fresh session
      const loginRes = await request(app).post('/api/auth/login').send({
        email: activeUser.email,
        password: testPassword
      });
      
      const newCookieRaw = loginRes.headers['set-cookie'][0].split(';')[0]; // "sessionId=abc..."
      
      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', newCookieRaw);
        
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers['set-cookie'][0]).toContain('sessionId=;');
      
      // Attempt to access me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', newCookieRaw);
        
      expect(meRes.status).toBe(401);
    });
  });

  describe('Role-based Authorization Middleware', () => {
    it('blocks access with 403 when role is insufficient', async () => {
      // Create a dummy route to test requireRole
      app.get('/api/auth/test-admin', (await import('../../src/middleware/auth.middleware.js')).requireAuth, (await import('../../src/middleware/auth.middleware.js')).requireRole(['Administrator']), (req, res) => {
        res.status(200).json({ ok: true });
      });

      // Login as Requester
      const loginRes = await request(app).post('/api/auth/login').send({
        email: activeUser.email,
        password: testPassword
      });
      const requesterCookie = loginRes.headers['set-cookie'][0].split(';')[0];

      // Attempt to access Admin route
      const adminRes = await request(app)
        .get('/api/auth/test-admin')
        .set('Cookie', requesterCookie);

      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error).toContain('Forbidden: Insufficient permissions');
    });
  });
});
