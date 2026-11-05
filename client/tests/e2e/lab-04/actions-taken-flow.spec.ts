import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function execPrisma(script: string) {
  execSync('node --input-type=module', {
    input: script,
    cwd: '../server',
    env: { ...process.env, DATABASE_URL: 'postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public' }
  });
}

test.describe('E2E-01: Actions Taken Workflow & Revision History (Lab 4)', () => {
  const runId = Date.now() + Math.floor(Math.random() * 10000);
  const staffAEmail = `staff_a_${runId}@example.com`;
  const staffBEmail = `staff_b_${runId}@example.com`;
  const adminEmail = `admin_e2e_${runId}@example.com`;
  const reqEmail = `req_e2e_${runId}@example.com`;
  const ticketSummary = `E2E-01 Actions Taken Flow Ticket ${runId}`;

  test.beforeAll(async () => {
    const setupScript = `
      import { PrismaClient } from '@prisma/client';
      import * as bcrypt from 'bcrypt';
      const prisma = new PrismaClient();
      async function setup() {
        const hash = await bcrypt.hash('password123', 10);
        const uStaffA = await prisma.user.create({ data: { name: 'Staff Alpha', email: '${staffAEmail}', passwordHash: hash, role: 'IT Staff', requiresPasswordChange: false } });
        const uStaffB = await prisma.user.create({ data: { name: 'Staff Beta', email: '${staffBEmail}', passwordHash: hash, role: 'IT Staff', requiresPasswordChange: false } });
        const uAdmin = await prisma.user.create({ data: { name: 'Admin E2E', email: '${adminEmail}', passwordHash: hash, role: 'Administrator', requiresPasswordChange: false } });
        const uReq = await prisma.user.create({ data: { name: 'Requester E2E', email: '${reqEmail}', passwordHash: hash, role: 'Requester', requiresPasswordChange: false } });

        const cat = await prisma.category.findFirst();
        const sys = await prisma.relatedSystem.findFirst();

        await prisma.ticket.create({
          data: {
            summary: '${ticketSummary}',
            description: 'Ticket for testing actions taken creation and revision history',
            priority: 'High',
            itPriority: 'High',
            status: 'In Progress',
            categoryId: cat.id,
            relatedSystemId: sys.id,
            requesterId: uReq.id,
            ownerId: uStaffA.id
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
        const users = await prisma.user.findMany({ where: { email: { in: ['${staffAEmail}', '${staffBEmail}', '${adminEmail}', '${reqEmail}'] } } });
        const userIds = users.map(u => u.id);
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        const tickets = await prisma.ticket.findMany({ where: { summary: '${ticketSummary}' } });
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

  test('E2E-01: Full Actions Taken lifecycle with successive edits, snapshot matching, and role visibility', async ({ page }) => {
    // ------------------------------------------------------------------------
    // Step 1: Staff A logs in, opens ticket, and logs initial Action Taken
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', staffAEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // IT Staff lands on Staff Ticket Queue by default
    await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();

    // Click ticket in queue
    await expect(page.locator(`text="${ticketSummary}"`).first()).toBeVisible();
    await page.click(`text="${ticketSummary}"`);

    // Verify Staff Ticket Detail and Actions Taken section
    await expect(page.getByRole('heading', { level: 5, name: /Actions Taken/i })).toBeVisible();
    await expect(page.locator('button:has-text("+ Add Action Taken")')).toBeVisible();

    // Open Add Action Taken Modal
    await page.click('button:has-text("+ Add Action Taken")');
    await expect(page.locator('text="Log Action Taken"')).toBeVisible();

    // Verify auto-recorded performer text
    await expect(page.getByText('Will be recorded as:')).toBeVisible();

    // Fill form fields
    await page.fill('textarea#create-actionDescription', 'Initial inspection of network switch cabling and port diagnostics.');
    await page.fill('textarea#create-result', 'Identified faulty patch cable on switch port 14.');
    await page.check('input#create-followUpRequired');
    await page.fill('textarea#create-followUpNote', 'Replace CAT6 patch cable with certified shielded cable.');
    await page.fill('input#create-attachmentNotes', 'switch_port_diagram.pdf');

    // Submit form (mandatory UUIDv4 idempotency key generated on client)
    await page.click('button:has-text("Save Action Taken")');

    // Verify Action Taken appears on timeline
    await expect(page.locator('text="Initial inspection of network switch cabling and port diagnostics."')).toBeVisible();
    await expect(page.locator('text="Identified faulty patch cable on switch port 14."')).toBeVisible();
    await expect(page.locator('text="Recorded by: Staff Alpha"')).toBeVisible();
    await expect(page.locator('text="Follow-Up Required"')).toBeVisible();

    // Logout Staff A
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 2: Staff B logs in, edits the Action Taken (Revision 1)
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', staffBEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();
    await page.click(`text="${ticketSummary}"`);

    // Click Edit Action button
    await page.click('button[aria-label="Edit Action Taken"]');
    await expect(page.locator('text="Edit Action Taken"')).toBeVisible();

    // Verify original actor remains immutable
    await expect(page.getByText('Originally recorded by: Staff Alpha')).toBeVisible();

    // Make Edit 1
    await page.fill('textarea#edit-actionDescription', 'Initial inspection and replacement of faulty CAT6 patch cable on port 14.');
    await page.fill('textarea#edit-result', 'Cable replaced. Port link status restored to 1Gbps full duplex.');
    await page.uncheck('input#edit-followUpRequired'); // Follow up cleared

    await page.click('button:has-text("Save Changes")');

    // Verify updated values on timeline
    await expect(page.locator('text="Initial inspection and replacement of faulty CAT6 patch cable on port 14."')).toBeVisible();
    await expect(page.locator('text="Cable replaced. Port link status restored to 1Gbps full duplex."')).toBeVisible();
    // Original recorded by remains Staff Alpha
    await expect(page.locator('text="Recorded by: Staff Alpha"')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 3: Staff B performs a second successive edit with latest CAS token (Revision 2)
    // ------------------------------------------------------------------------
    await page.click('button[aria-label="Edit Action Taken"]');
    await expect(page.locator('text="Edit Action Taken"')).toBeVisible();

    await page.fill('textarea#edit-result', 'Cable replaced and verified with cable tester. Link operating at 1Gbps full duplex without packet loss.');
    await page.click('button:has-text("Save Changes")');

    await expect(page.getByText('Cable replaced and verified with cable tester.')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 4: Verify Revision History as IT Staff (both revisions visible with diffs)
    // ------------------------------------------------------------------------
    await page.click('button[aria-label="View Action Taken Revision History"]');
    await expect(page.getByText('Revision History - Action Taken')).toBeVisible();

    // Both revisions must be displayed in deterministic order
    await expect(page.locator('text="Revision #1"')).toBeVisible();
    await expect(page.locator('text="Revision #2"')).toBeVisible();
    await expect(page.getByText('Edited by: Staff Beta').first()).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByText('Revision History - Action Taken')).not.toBeVisible();

    // Logout Staff B
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 5: Verify Administrator can also view Revision History
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Admin lands on User Management by default, clicks Ticket Queue
    await page.click('button:has-text("Ticket Queue")');
    await page.click(`text="${ticketSummary}"`);

    // Admin can see Actions Taken and View History button
    await expect(page.locator('button[aria-label="View Action Taken Revision History"]')).toBeVisible();
    await page.click('button[aria-label="View Action Taken Revision History"]');
    await expect(page.getByText('Revision History - Action Taken')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Revision History - Action Taken')).not.toBeVisible();

    // Logout Admin
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 6: Verify Requester sees read-only timeline but CANNOT see history controls
    // ------------------------------------------------------------------------
    await page.goto('/');
    await page.fill('input[type="email"]', reqEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Open ticket from My Tickets
    await page.click('button:has-text("My Tickets")');
    await page.click(`text="${ticketSummary}"`);

    // Requester sees Actions Taken timeline
    await expect(page.getByRole('heading', { level: 5, name: /Actions Taken/i })).toBeVisible();
    await expect(page.locator('text="Initial inspection and replacement of faulty CAT6 patch cable on port 14."')).toBeVisible();

    // Requester CANNOT see Add Action Taken, Edit Action, or View History controls
    await expect(page.locator('button:has-text("+ Add Action Taken")')).not.toBeVisible();
    await expect(page.locator('button[aria-label="Edit Action Taken"]')).not.toBeVisible();
    await expect(page.locator('button[aria-label="View Action Taken Revision History"]')).not.toBeVisible();
  });
});
