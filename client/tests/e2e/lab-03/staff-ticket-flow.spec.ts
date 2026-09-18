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
        await prisma.ticket.deleteMany({ where: { summary: '${ticketSummary}' } });
        await prisma.session.deleteMany({ where: { userId: { not: 0 } } });
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
    await page.press('input[placeholder="Search ID or summary..."]', 'Enter');

    // Click the found ticket securely
    const ticketRow = page.locator(`text="${ticketSummary}" >> visible=true`).first();
    await expect(ticketRow).toBeVisible();
    await ticketRow.click();

    // Verify correct UI text for ticket detail
    await expect(page.locator('label:has-text("Assignment")')).toBeVisible();

    // Test real CLAIM
    await page.click('button:has-text("Claim Ticket")');
    // Ensure the assignment changed by waiting for the dropdown to show "Staff Test (Me)"
    await expect(page.locator('select:has(option[value="Unassigned"])')).toContainText('Staff Test (Me)');

    // Update priorities and status
    await page.selectOption('select:has(option[value="Critical"])', 'High');
    await page.selectOption('select:has(option[value="In Progress"])', 'In Progress');
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
