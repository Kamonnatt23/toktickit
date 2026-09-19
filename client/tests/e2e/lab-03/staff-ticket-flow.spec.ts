import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const runId = Date.now() + Math.floor(Math.random() * 10000);
const staffEmail = `staff_test_${runId}@example.com`;
const reqEmail = `req_test_${runId}@example.com`;
const ticketSummary = `Unique Search Ticket ${runId}`;

test.describe('Staff Ticket Flow', () => {
  test.beforeAll(async () => {
    const setupScript = `
      import { PrismaClient } from '@prisma/client';
      import * as bcrypt from 'bcrypt';
      const prisma = new PrismaClient();
      async function setup() {
        await prisma.user.create({ data: { name: 'Staff Test', email: '${staffEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'IT Staff', requiresPasswordChange: false } });
        await prisma.user.create({ data: { name: 'Req Test', email: '${reqEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'Requester', requiresPasswordChange: false } });

        const cat = await prisma.category.findFirst();
        const sys = await prisma.relatedSystem.findFirst();
        const req = await prisma.user.findFirst({ where: { email: '${reqEmail}' } });

        await prisma.ticket.create({
          data: { summary: '${ticketSummary}', description: 'Search and Claim Test Ticket', priority: 'High', itPriority: 'High', categoryId: cat.id, relatedSystemId: sys.id, requesterId: req.id, status: 'Open' }
        });
      }
      setup().finally(() => prisma.$disconnect());
    `;
    execSync(`node --input-type=module -e "${setupScript.replace(/\n/g, '')}"`, { cwd: '../server' });
  });

  test.afterAll(async () => {
    const teardownScript = `
      import { PrismaClient } from '@prisma/client';
      const prisma = new PrismaClient();
      async function clean() {
        const t = await prisma.ticket.findFirst({ where: { summary: '${ticketSummary}' } });
        if (t) {
          await prisma.publicComment.deleteMany({ where: { ticketId: t.id } });
          await prisma.internalNote.deleteMany({ where: { ticketId: t.id } });
          await prisma.ticket.deleteMany({ where: { id: t.id } });
        }
        const users = await prisma.user.findMany({ where: { email: { in: ['${staffEmail}', '${reqEmail}'] } } });
        await prisma.session.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
        await prisma.user.deleteMany({
          where: { email: { in: ['${staffEmail}', '${reqEmail}'] } }
        });
      }
      clean().finally(() => prisma.$disconnect());
    `;
    execSync(`node --input-type=module -e "${teardownScript.replace(/\n/g, '')}"`, { cwd: '../server' });
  });

  test('staff queue, triage, and ticket interaction', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();

    // Test existing filter
    await page.selectOption('select:has(option[value="Open"])', 'Open');

    // Test real queue SEARCH
    await page.fill('input[placeholder="Search ID or summary..."]', ticketSummary);
    const searchResponsePromise = page.waitForResponse(r => r.url().includes('/api/staff/tickets') && r.status() === 200);
    await page.press('input[placeholder="Search ID or summary..."]', 'Enter');
    await searchResponsePromise;
    await expect(page.locator('.spinner-border')).toHaveCount(0);
    await page.waitForTimeout(1000);

    // Click the found ticket securely
    const ticketRow = page.locator('tr').filter({ hasText: ticketSummary }).first();
    await expect(ticketRow).toBeVisible();
    await ticketRow.click({ force: true });
    await page.waitForTimeout(1000);

    // Verify correct UI text for ticket detail
    await expect(page.locator('label:has-text("Assignment")')).toBeVisible();

    // Test real CLAIM
    const claimResponsePromise = page.waitForResponse(r => r.url().includes('/api/tickets/') && r.status() === 200);
    await page.click('button:has-text("Claim Ticket")');
    await claimResponsePromise;
    // Ensure the assignment changed by waiting for the dropdown to show "Staff Test (Me)"
    await expect(page.locator('select:has-text("Unassigned")')).toContainText('Staff Test (Me)');

    // Update priorities and status
    const priorityResponsePromise = page.waitForResponse(r => r.url().includes('/api/tickets/') && r.status() === 200);
    await page.locator('text="IT Priority"').locator('xpath=..').locator('select').selectOption('High');
    await priorityResponsePromise;

    await page.locator('text="Update Status"').locator('xpath=..').locator('select').selectOption('In Progress');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug-before-confirm.png' });
    await page.click('button:has-text("Confirm Status Change")');

    // Internal Note
    await page.fill('textarea[placeholder="Type your message here..."]', 'Investigating this issue now.');
    await page.check('input#internalNoteSwitch');
    await page.click('button:has-text("Post Message")');
    await expect(page.getByText('Investigating this issue now.', { exact: true })).toBeVisible();

    // Public Comment
    await page.fill('textarea[placeholder="Type your message here..."]', 'We are looking into this.');
    await page.uncheck('input#internalNoteSwitch');
    await page.click('button:has-text("Post Message")');
    await expect(page.getByText('We are looking into this.', { exact: true })).toBeVisible();
  });
});
