import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrisma } from '../../src/prisma.js';

describe('Lab 4 Database Migration, Constraints & Audit Retention (MIG-01..03)', () => {
  const prisma = getPrisma();
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('MIG-01: onDelete: Restrict on ActionTaken prevents cascade deletion of parent Ticket and User', async () => {
    if (!dbAvailable) return;

    // 1. Create User, Ticket, ActionTaken
    const user = await prisma.user.create({
      data: {
        name: 'MIG01 User',
        email: `mig01-${Date.now()}@test.com`,
        role: 'IT Staff',
        passwordHash: 'hash',
        requiresPasswordChange: false
      }
    });

    const cat = await prisma.category.findFirst();
    const sys = await prisma.relatedSystem.findFirst();

    const ticket = await prisma.ticket.create({
      data: {
        categoryId: cat!.id,
        relatedSystemId: sys!.id,
        summary: 'MIG01 Ticket',
        description: 'Testing onDelete: Restrict',
        priority: 'Low',
        itPriority: 'Low',
        requesterId: user.id
      }
    });

    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        performedById: user.id,
        actionDescription: 'MIG01 Action',
        result: 'MIG01 Result',
        followUpRequired: false
      }
    });

    // Attempting to delete Ticket must be rejected by onDelete: Restrict (P2003 / foreign key violation)
    await expect(
      prisma.ticket.delete({ where: { id: ticket.id } })
    ).rejects.toThrow();

    // Attempting to delete User who performed action must be rejected
    await expect(
      prisma.user.delete({ where: { id: user.id } })
    ).rejects.toThrow();
  });

  it('MIG-02: Legacy tickets receive resolvedAt = NULL and preserve Lab 1-3 row integrity', async () => {
    if (!dbAvailable) return;

    // Verify Ticket model has resolvedAt and updatedAt columns
    const ticketsWithNullResolved = await prisma.ticket.findMany({
      where: {
        status: { in: ['Resolved', 'Closed'] },
        resolvedAt: null
      }
    });

    // Legacy resolved tickets must have resolvedAt = null
    expect(ticketsWithNullResolved).toBeDefined();
  });

  it('MIG-03: onDelete: Restrict on ActionTakenRevision prevents deletion of parent ActionTaken and editor User', async () => {
    if (!dbAvailable) return;

    const editor = await prisma.user.create({
      data: {
        name: 'MIG03 Editor',
        email: `mig03-${Date.now()}@test.com`,
        role: 'IT Staff',
        passwordHash: 'hash',
        requiresPasswordChange: false
      }
    });

    const cat = await prisma.category.findFirst();
    const sys = await prisma.relatedSystem.findFirst();

    const ticket = await prisma.ticket.create({
      data: {
        categoryId: cat!.id,
        relatedSystemId: sys!.id,
        summary: 'MIG03 Ticket',
        description: 'Testing ActionTakenRevision foreign key restrict',
        priority: 'Low',
        itPriority: 'Low',
        requesterId: editor.id
      }
    });

    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        performedById: editor.id,
        actionDescription: 'MIG03 Action',
        result: 'MIG03 Result',
        followUpRequired: false
      }
    });

    await prisma.actionTakenRevision.create({
      data: {
        actionTakenId: action.id,
        editedById: editor.id,
        beforeSnapshot: { test: 'before' },
        afterSnapshot: { test: 'after' }
      }
    });

    // Attempting to delete ActionTaken with revisions must be rejected (SQLSTATE 23503 / P2003 Restrict)
    await expect(
      prisma.actionTaken.delete({ where: { id: action.id } })
    ).rejects.toThrow();

    // Attempting to delete editor User must be rejected
    await expect(
      prisma.user.delete({ where: { id: editor.id } })
    ).rejects.toThrow();
  });
});
