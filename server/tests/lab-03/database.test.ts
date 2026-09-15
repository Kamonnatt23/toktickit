import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Lab 3 Database Schema & Seed Verification', () => {
  beforeAll(async () => {
    // We assume the seed has run before tests
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('User Model', () => {
    it('should have uniquely seeded users with correct roles', async () => {
      const requesters = await prisma.user.findMany({ where: { role: 'Requester' } });
      const staff = await prisma.user.findMany({ where: { role: 'IT Staff' } });
      const admins = await prisma.user.findMany({ where: { role: 'Administrator' } });

      expect(requesters.length).toBeGreaterThanOrEqual(5); // 4 active, 1 inactive seeded
      expect(staff.length).toBeGreaterThanOrEqual(4); // 3 active, 1 inactive
      expect(admins.length).toBeGreaterThanOrEqual(1); // 1 active

      // Check specific user constraints
      const inactiveUser = await prisma.user.findUnique({ where: { email: 'inactive.req@example.com' } });
      expect(inactiveUser?.isActive).toBe(false);
      expect(inactiveUser?.passwordHash).toBeDefined();
      expect(inactiveUser?.requiresPasswordChange).toBe(true);
    });

    it('enforces unique email constraint', async () => {
      await expect(
        prisma.user.create({
          data: {
            name: 'Duplicate Email',
            email: 'admin@example.com', // Seeded admin
            role: 'Requester',
            passwordHash: 'hash'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Session Model', () => {
    it('supports creation of a session linked to a user', async () => {
      const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
      expect(admin).toBeDefined();

      const session = await prisma.session.create({
        data: {
          tokenHash: 'dummy-hash-123',
          userId: admin!.id
        }
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(admin!.id);
      expect(session.lastActiveAt).toBeDefined();

      // Cleanup
      await prisma.session.delete({ where: { id: session.id } });
    });
  });

  describe('Ticket & Attachment Models (Migration / Existing Data)', () => {
    it('preserves existing Lab 2 Tickets and respects new schema properties', async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { summary: 'Cannot access email' }
      });
      
      expect(ticket).toBeDefined();
      expect(ticket?.status).toBeDefined(); // 'New'
      expect(ticket?.priority).toBeDefined();
      expect(ticket?.itPriority).toBeDefined(); // Should have fallback or actual value
      expect(ticket?.requesterId).toBeDefined();
      
      // Verify relation maps correctly to User model
      const requester = await prisma.user.findUnique({ where: { id: ticket!.requesterId } });
      expect(requester).toBeDefined();
    });

    it('maintains Ticket ownership and relations', async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { summary: 'VPN drops connection' },
        include: { owner: true, requester: true }
      });

      expect(ticket).toBeDefined();
      expect(ticket!.owner).toBeDefined();
      expect(ticket!.owner?.role).toBe('IT Staff'); // IT Staff restriction
      expect(ticket!.requester).toBeDefined();
    });

    it('allows comments and internal notes', async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { summary: 'VPN drops connection' },
        include: { publicComments: true, internalNotes: true }
      });

      expect(ticket).toBeDefined();
      expect(ticket!.publicComments.length).toBeGreaterThanOrEqual(2);
      expect(ticket!.internalNotes.length).toBeGreaterThanOrEqual(1);

      // Verify structure
      const note = ticket!.internalNotes[0];
      expect(note.content).toBeDefined();
      expect(note.authorId).toBeDefined();
      expect(note.ticketId).toBe(ticket!.id);
    });
  });
});
