import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function execPrisma(script: string) {
  execSync('node --input-type=module', {
    input: script,
    cwd: '../server',
    env: { ...process.env, DATABASE_URL: 'postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public' }
  });
}

const viewports = [
  { name: 'Desktop', width: 1200, height: 800 },
  { name: 'Tablet', width: 800, height: 1024 },
  { name: 'Mobile', width: 400, height: 800 },
];

test.describe('Operational Dashboards & Responsive Viewports (Lab 4 - E2E-04 & E2E-05)', () => {
  test.beforeAll(async () => {
    // Ensure test accounts do not require password change and admin has Administrator role
    execPrisma(`
      import { PrismaClient } from '@prisma/client';
      const prisma = new PrismaClient();
      async function fix() {
        await prisma.user.updateMany({
          where: { email: { in: ['john@example.com', 'staff1@example.com', 'admin@example.com'] } },
          data: { requiresPasswordChange: false }
        });
        await prisma.user.update({
          where: { email: 'admin@example.com' },
          data: { role: 'Administrator', requiresPasswordChange: false }
        });
      }
      fix().finally(() => prisma.$disconnect());
    `);
  });

  // E2E-04: Operational Dashboards navigation, Unassigned drill-down, and filtering
  test('E2E-04: Operational Dashboards navigation, Unassigned drill-down, and filtering', async ({ page }) => {
    await page.goto('/');

    // 1. Requester Journey
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
    await page.fill('input[type="email"]', 'john@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Requester navigates to Dashboard tab
    await page.click('button:has-text("Dashboard")');

    // Verify Requester Dashboard metrics & activity lists
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('text="My Open Tickets"')).toBeVisible();
    await expect(page.locator('text="Action Required"')).toBeVisible();
    await expect(page.locator('text="Recently Updated Tickets"')).toBeVisible();

    // Click My Open Tickets drilldown -> /tickets?view=open
    await page.click('text="View all →"');
    await expect(page.locator('text="Active Dashboard Filter:"')).toBeVisible();
    await expect(page.locator('text="My Open Tickets"')).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // 2. Staff Journey
    await page.goto('/');
    await page.fill('input[type="email"]', 'staff1@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Staff navigates to Dashboard tab
    await page.click('button:has-text("Dashboard")');

    // Verify Staff Dashboard metrics & queue
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('text="Unassigned"')).toBeVisible();
    await expect(page.locator('text="My Assigned"')).toBeVisible();
    await expect(page.locator('text="Active Priority Distribution:"')).toBeVisible();
    await expect(page.locator('text="Recently Updated Queue"')).toBeVisible();

    // Click Unassigned Queue drilldown -> /staff/tickets?ownerId=Unassigned
    await page.click('text="Assign queue →"');
    await expect(page.locator('text="Active Dashboard Filter:"')).toBeVisible();
    await expect(page.locator('text="Unassigned Queue"')).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // 3. Administrator Journey
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Admin navigates to Dashboard tab
    await page.click('button:has-text("Dashboard")');

    // Verify Admin Dashboard operational metrics + User Administration Summary
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('text="User Administration Summary"')).toBeVisible();
    await expect(page.locator('text="Total Users"')).toBeVisible();
    await expect(page.locator('text="Active Requesters"')).toBeVisible();
    await expect(page.locator('text="Active Staff"')).toBeVisible();
    await expect(page.locator('text="Active Admins"')).toBeVisible();

    // Click Manage Users → link
    await page.click('text="Manage Users →"');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
  });

  // E2E-05: Responsive dashboard layout across Desktop, Tablet, and Mobile
  for (const vp of viewports) {
    test(`E2E-05: Responsive dashboard layout and release screenshots at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Verify sign in page fits viewport without horizontal scroll
      let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // 1. Requester Dashboard Screenshot & Layout
      await page.fill('input[type="email"]', 'john@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.click('button:has-text("Dashboard")');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      await page.screenshot({
        path: `../artifacts/lab-04/screenshots/Requester-Dashboard-${vp.name}.png`,
        fullPage: true
      });

      await page.click('button[title="Logout"]');
      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

      // 2. Staff Dashboard Screenshot & Layout
      await page.goto('/');
      await page.fill('input[type="email"]', 'staff1@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.click('button:has-text("Dashboard")');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      await page.screenshot({
        path: `../artifacts/lab-04/screenshots/Staff-Dashboard-${vp.name}.png`,
        fullPage: true
      });

      // If Desktop, capture detail views for release evidence
      if (vp.name === 'Desktop') {
        // Go to ticket queue and open a ticket
        await page.click('button:has-text("Ticket Queue")');
        const firstRow = page.locator('tbody tr').first();
        if (await firstRow.isVisible()) {
          await firstRow.click();
          await page.waitForTimeout(500);

          // Capture Actions Taken Timeline
          if (await page.getByRole('heading', { level: 5, name: /Actions Taken/i }).isVisible()) {
            await page.screenshot({
              path: `../artifacts/lab-04/screenshots/Actions-Taken-Timeline-Desktop.png`,
              fullPage: true
            });
          }

          // Test Resolution Gate Warning on ticket with 0 actions if possible
          const statusSelect = page.locator('select[aria-label="Update ticket status"]');
          if (await statusSelect.isVisible()) {
            try {
              await statusSelect.selectOption('Resolved');
              if (await page.getByText('Resolution Gate: At least one Action Taken must be recorded').isVisible()) {
                await page.screenshot({
                  path: `../artifacts/lab-04/screenshots/Resolution-Gate-Warning-Desktop.png`,
                  fullPage: true
                });
              }
            } catch (e) {
              // Ignore if Resolved not in allowed transitions
            }
          }
        }
      }

      await page.click('button[title="Logout"]');
      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

      // 3. Administrator Dashboard Screenshot & Layout
      await page.goto('/');
      await page.fill('input[type="email"]', 'admin@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.click('button:has-text("Dashboard")');
      await expect(page.locator('text="User Administration Summary"')).toBeVisible();
      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      await page.screenshot({
        path: `../artifacts/lab-04/screenshots/Admin-Dashboard-${vp.name}.png`,
        fullPage: true
      });

      await page.click('button[title="Logout"]');
      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
    });
  }
});
