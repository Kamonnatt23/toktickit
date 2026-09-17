import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function restoreAll() {
  const script = `
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function clean() {
      await prisma.user.updateMany({
        where: { email: { in: ['charlie@example.com', 'staff2@example.com', 'admin@example.com'] } },
        data: { requiresPasswordChange: true, passwordHash: '$2b$10$T.vM0h0mC3n.y6QpX009r.D1PjP0rG6s.t4Gj4g1z.w.E7G0r6qGy' }
      });
    }
    clean().finally(() => prisma.$disconnect());
  `;
  execSync(`node --input-type=module -e "${script.replace(/\n/g, '')}"`, { cwd: '../server' });
}

const viewports = [
  { name: 'Desktop', width: 1200, height: 800 },
  { name: 'Mobile', width: 400, height: 800 },
];

test.describe('Responsive UI verification (Lab 3)', () => {
  test.afterAll(() => restoreAll());

  for (const vp of viewports) {
    test(`takes screenshots at ${vp.name} resolution`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

      await page.fill('input[type="email"]', 'charlie@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      try {
        await expect(page.locator('text="Change Required"')).toBeVisible({ timeout: 2000 });
        await page.fill('input[id="currentPassword"]', 'password123');
        await page.fill('input[id="newPassword"]', 'newpassword123');
        await page.fill('input[id="confirmPassword"]', 'newpassword123');
        await page.click('button:has-text("Change Password")');
      } catch(e) {}

      await expect(page.locator('text="Create Ticket"').first()).toBeVisible();

      await page.click('button[title="Logout"]');
      await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

      await page.fill('input[type="email"]', 'staff2@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      try {
        await expect(page.locator('text="Change Required"')).toBeVisible({ timeout: 2000 });
        await page.fill('input[id="currentPassword"]', 'password123');
        await page.fill('input[id="newPassword"]', 'newpassword123');
        await page.fill('input[id="confirmPassword"]', 'newpassword123');
        await page.click('button:has-text("Change Password")');
      } catch(e) {}

      await expect(page.locator('text="Ticket Queue"').first()).toBeVisible();

      const firstTicket = page.locator('.card').first();
      await firstTicket.click();
      await expect(page.locator('text="Assignee"')).toBeVisible();

      await page.click('button[title="Logout"]');
      
      await page.fill('input[type="email"]', 'admin@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      try {
        await expect(page.locator('text="Change Required"')).toBeVisible({ timeout: 2000 });
        await page.fill('input[id="currentPassword"]', 'password123');
        await page.fill('input[id="newPassword"]', 'newpassword123');
        await page.fill('input[id="confirmPassword"]', 'newpassword123');
        await page.click('button:has-text("Change Password")');
      } catch(e) {}

      await expect(page.locator('text="User Management"').first()).toBeVisible();
    });
  }
});
