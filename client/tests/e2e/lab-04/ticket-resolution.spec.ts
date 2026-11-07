import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function execPrisma(script: string) {
  execSync('node --input-type=module', {
    input: script,
    cwd: '../server',
    env: { ...process.env, DATABASE_URL: 'postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public' }
  });
}

test.describe('E2E-02 & E2E-03: Ticket Resolution Lifecycle & Return-to-Work Journey (Lab 4)', () => {
  const runId = Date.now() + Math.floor(Math.random() * 10000);
  const staffEmail = `staff_res_${runId}@example.com`;
  const reqEmail = `req_res_${runId}@example.com`;
  const ticketSummaryE2E02 = `E2E-02 Resolution Gate Ticket ${runId}`;
  const ticketSummaryE2E03 = `E2E-03 Return to Work Ticket ${runId}`;

  test.beforeAll(async () => {
    const setupScript = `
      import { PrismaClient } from '@prisma/client';
      import * as bcrypt from 'bcrypt';
      const prisma = new PrismaClient();
      async function setup() {
        const hash = await bcrypt.hash('password123', 10);
        const uStaff = await prisma.user.create({ data: { name: 'Staff Resolver', email: '${staffEmail}', passwordHash: hash, role: 'IT Staff', requiresPasswordChange: false } });
        const uReq = await prisma.user.create({ data: { name: 'Requester Reporter', email: '${reqEmail}', passwordHash: hash, role: 'Requester', requiresPasswordChange: false } });

        const cat = await prisma.category.findFirst();
        const sys = await prisma.relatedSystem.findFirst();

        // 1. In Progress ticket with 0 actions for E2E-02
        await prisma.ticket.create({
          data: {
            summary: '${ticketSummaryE2E02}',
            description: 'Ticket to test Resolution Gate blocking and resolution lifecycle',
            priority: 'Medium',
            itPriority: 'Medium',
            status: 'In Progress',
            categoryId: cat.id,
            relatedSystemId: sys.id,
            requesterId: uReq.id,
            ownerId: uStaff.id
          }
        });

        // 2. Closed ticket with resolvedAt for E2E-03
        await prisma.ticket.create({
          data: {
            summary: '${ticketSummaryE2E03}',
            description: 'Ticket to test Closed -> Reopened -> In Progress -> Resolved lifecycle',
            priority: 'High',
            itPriority: 'High',
            status: 'Closed',
            categoryId: cat.id,
            relatedSystemId: sys.id,
            requesterId: uReq.id,
            ownerId: uStaff.id,
            resolvedAt: new Date(Date.now() - 3600000)
          }
        });
      }
      setup().finally(() => prisma.$disconnect());
    `;
    execPrisma(setupScript);
  });

  test.afterAll(async () => {
    const teardownScript = `
      import { PrismaClient } from '@prisma/client';
      const prisma = new PrismaClient();
      async function teardown() {
        const users = await prisma.user.findMany({ where: { email: { in: ['${staffEmail}', '${reqEmail}'] } } });
        const userIds = users.map(u => u.id);
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        const tickets = await prisma.ticket.findMany({ where: { summary: { in: ['${ticketSummaryE2E02}', '${ticketSummaryE2E03}'] } } });
        for (const t of tickets) {
          await prisma.publicComment.deleteMany({ where: { ticketId: t.id } });
          await prisma.internalNote.deleteMany({ where: { ticketId: t.id } });
          await prisma.idempotencyKey.deleteMany({ where: { ticketId: t.id } });
        }
      }
      teardown().finally(() => prisma.$disconnect());
    `;
    try {
      execPrisma(teardownScript);
    } catch (e) {
      // Ignore cleanup error in disposable test DB
    }
  });

  test('E2E-02: Ticket Resolution Lifecycle, Resolution Gate blocking, and Requester comment auto-reopen', async ({ page }) => {
    // ------------------------------------------------------------------------
    // Step 1: Staff logs in and navigates to the In Progress ticket (0 actions)
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();
    await page.click(`text="${ticketSummaryE2E02}"`);

    // Verify current status is In Progress and 0 actions
    await expect(page.getByRole('heading', { level: 5, name: /Actions Taken/i })).toContainText('0');

    // ------------------------------------------------------------------------
    // Step 2: Attempt to select 'Resolved' in Status dropdown
    // ------------------------------------------------------------------------
    await page.selectOption('select[aria-label="Update ticket status"]', 'Resolved');

    // Resolution Gate banner must be visible
    await expect(page.getByText('Resolution Gate: At least one Action Taken must be recorded')).toBeVisible();

    // Confirm button must be disabled or not rendered
    const confirmBtn = page.locator('button:has-text("Confirm Status Change")');
    await expect(confirmBtn).toBeDisabled();

    // ------------------------------------------------------------------------
    // Step 3: Log an Action Taken
    // ------------------------------------------------------------------------
    await page.click('button:has-text("+ Add Action Taken")');
    await page.fill('textarea#create-actionDescription', 'Applied firmware patch 2.4.1 to resolve memory leak.');
    await page.fill('textarea#create-result', 'Memory consumption stabilized at 42%. Verified via telemetry.');
    await page.click('button:has-text("Save Action Taken")');

    // Verify action is displayed
    await expect(page.locator('text="Applied firmware patch 2.4.1 to resolve memory leak."')).toBeVisible();
    await expect(page.getByRole('heading', { level: 5, name: /Actions Taken/i })).toContainText('1');

    // ------------------------------------------------------------------------
    // Step 4: Now select 'Resolved' -> Resolution Gate passes
    // ------------------------------------------------------------------------
    await page.selectOption('select[aria-label="Update ticket status"]', 'Resolved');

    // Warning is gone, confirm button is enabled
    await expect(page.getByText('Resolution Gate: At least one Action Taken must be recorded')).not.toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    // Optional resolution comment textarea appears
    await expect(page.locator('text="Resolution Details (optional Public Comment explaining fix to requester)"')).toBeVisible();
    await page.fill('textarea[placeholder="Explain the fix to the requester..."]', 'Firmware patch applied successfully. Memory leak issue is resolved.');

    // Confirm status change
    await confirmBtn.click();

    // Verify ticket status changed to Resolved
    await expect(page.locator('.badge:has-text("Resolved")').first()).toBeVisible();

    // Logout Staff
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 5: Requester logs in, views Resolved ticket, and posts Public Comment to reopen
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', reqEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.click('button:has-text("My Tickets")');
    await page.click(`text="${ticketSummaryE2E02}"`);

    // Verify Requester sees Resolved status and resolution comment
    await expect(page.locator('.badge:has-text("Resolved")').first()).toBeVisible();
    await expect(page.getByText('Firmware patch applied successfully.')).toBeVisible();

    // Post Public Comment indicating issue persists
    const commentInput = page.locator('textarea[placeholder="Type your message here..."]');
    await commentInput.fill('The application restarted but memory usage started climbing again after 20 minutes.');
    await page.click('button:has-text("Post Message")');

    // Verify ticket auto-reopens to Reopened
    await expect(page.locator('.badge:has-text("Reopened")').first()).toBeVisible();
    await expect(page.getByText('The application restarted but memory usage started climbing again')).toBeVisible();

    // Logout Requester
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
  });

  test('E2E-03: Reopened Ticket Return-to-Work Journey (Closed -> Reopened -> In Progress -> Resolved)', async ({ page }) => {
    // ------------------------------------------------------------------------
    // Step 1: Staff logs in and opens Closed ticket
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', staffEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();
    // Find Closed ticket
    await page.click(`text="${ticketSummaryE2E03}"`);
    await expect(page.locator('.badge:has-text("Closed")').first()).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 2: Transition Closed -> Reopened with mandatory reason
    // ------------------------------------------------------------------------
    await page.selectOption('select[aria-label="Update ticket status"]', 'Reopened');
    await expect(page.locator('text="Reopen Reason"')).toBeVisible();
    await page.fill('textarea[placeholder="Reopen reason (required)"]', 'User reported recurrence of the defect after system reboot.');
    await page.click('button:has-text("Confirm Status Change")');

    await expect(page.locator('.badge:has-text("Reopened")').first()).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 3: Transition Reopened -> In Progress (assigned owner required)
    // ------------------------------------------------------------------------
    await page.selectOption('select[aria-label="Update ticket status"]', 'In Progress');
    await page.click('button:has-text("Confirm Status Change")');

    await expect(page.locator('.badge:has-text("In Progress")').first()).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 4: Log new Action Taken
    // ------------------------------------------------------------------------
    await page.click('button:has-text("+ Add Action Taken")');
    await page.fill('textarea#create-actionDescription', 'Replaced hardware memory modules and re-flashed BIOS to version 1.12.');
    await page.fill('textarea#create-result', 'Burn-in diagnostics ran for 2 hours with 0 memory errors.');
    await page.click('button:has-text("Save Action Taken")');

    await expect(page.locator('text="Replaced hardware memory modules and re-flashed BIOS to version 1.12."')).toBeVisible();
    await expect(page.getByRole('heading', { level: 5, name: /Actions Taken/i })).toContainText('1');

    // ------------------------------------------------------------------------
    // Step 5: Resolve ticket again
    // ------------------------------------------------------------------------
    await page.selectOption('select[aria-label="Update ticket status"]', 'Resolved');
    await page.fill('textarea[placeholder="Explain the fix to the requester..."]', 'Hardware memory modules replaced and diagnostics passed.');
    await page.click('button:has-text("Confirm Status Change")');

    await expect(page.locator('.badge:has-text("Resolved")').first()).toBeVisible();
  });
});
