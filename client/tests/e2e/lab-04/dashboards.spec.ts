import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'Desktop', width: 1200, height: 800 },
  { name: 'Tablet', width: 800, height: 1024 },
  { name: 'Mobile', width: 400, height: 800 },
];

test.describe('Operational Dashboards & Responsive Viewports (Lab 4 - Issue #59)', () => {
  // E2E-04: Operational Dashboards navigation, Unassigned drill-down, and filtering
  test('E2E-04: Operational Dashboards navigation, Unassigned drill-down, and filtering', async ({ page }) => {
    await page.goto('/');

    // 1. Requester Journey
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
    await page.fill('input[type="email"]', 'requester@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Verify Requester Dashboard metrics & activity lists
    await expect(page.locator('text="Welcome"')).toBeVisible();
    await expect(page.locator('text="My Open Tickets"')).toBeVisible();
    await expect(page.locator('text="Action Required"')).toBeVisible();
    await expect(page.locator('text="Recently Updated Tickets"')).toBeVisible();

    // Click My Open Tickets drilldown -> /tickets?view=open
    await page.click('text="View all →"');
    await expect(page.locator('text="Active Filter:"')).toBeVisible();
    await expect(page.locator('text="view: open"')).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // 2. Staff Journey
    await page.fill('input[type="email"]', 'staff@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Verify Staff Dashboard metrics & queue
    await expect(page.locator('text="Welcome back"')).toBeVisible();
    await expect(page.locator('text="Unassigned"')).toBeVisible();
    await expect(page.locator('text="My Assigned"')).toBeVisible();
    await expect(page.locator('text="Active Priority Distribution:"')).toBeVisible();
    await expect(page.locator('text="Recently Updated Queue"')).toBeVisible();

    // Click Unassigned Queue drilldown -> /staff/tickets?ownerId=Unassigned
    await page.click('text="Assign queue →"');
    await expect(page.locator('text="Active Filter:"')).toBeVisible();
    await expect(page.locator('text="ownerId: Unassigned"')).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // 3. Administrator Journey
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Verify Admin Dashboard operational metrics + User Administration Summary
    await expect(page.locator('text="Welcome back"')).toBeVisible();
    await expect(page.locator('text="User Administration Summary"')).toBeVisible();
    await expect(page.locator('text="Total Users"')).toBeVisible();
    await expect(page.locator('text="Active Requesters"')).toBeVisible();
    await expect(page.locator('text="Active Staff"')).toBeVisible();
    await expect(page.locator('text="Active Admins"')).toBeVisible();

    // Click Manage Users → link
    await page.click('text="Manage Users →"');
    await expect(page.locator('text="User Management"')).toBeVisible();

    // Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
  });

  // E2E-05: Responsive dashboard layout across Desktop, Tablet, and Mobile
  for (const vp of viewports) {
    test(`E2E-05: Responsive dashboard layout at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Verify sign in page fits viewport without horizontal scroll
      let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Sign in as Staff
      await page.fill('input[type="email"]', 'staff@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      // Verify Dashboard rendered and fits viewport
      await expect(page.locator('text="Welcome back"')).toBeVisible();
      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Verify metric cards and queue remain visible and accessible
      await expect(page.locator('text="Unassigned"')).toBeVisible();
      await expect(page.locator('text="Recently Updated Queue"')).toBeVisible();

      // Logout
      await page.click('button[title="Logout"]');
      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
    });
  }
});
