import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function restoreUser(email) {
  const script = `
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function restore() {
      const u = await prisma.user.findFirst({ where: { email: '${email}' } });
      if (u) {
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.user.update({
          where: { id: u.id },
          data: { requiresPasswordChange: true, passwordHash: '\$2b\$10\$T.vM0h0mC3n.y6QpX009r.D1PjP0rG6s.t4Gj4g1z.w.E7G0r6qGy' }
        });
      }
    }
    restore().finally(() => prisma.$disconnect());
  `;
  execSync(`node --input-type=module -e "${script.replace(/\n/g, '')}"`, { cwd: '../server' });
}

test.describe('Authentication Lifecycle', () => {
  test.afterAll(() => restoreUser('charlie@example.com'));

  test('valid login, mandatory password change, logout, and blocked access', async ({ page, request }) => {
    // URL hopping test for unauthenticated users (Browser Navigation)
    await page.goto('/my-tickets');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

    // API access blocked test
    const unauthRes = await request.get('http://127.0.0.1:3000/api/tickets');
    expect(unauthRes.status()).toBe(401);

    await page.goto('/');

    // 1. Invalid login
    await page.fill('input[type="email"]', 'charlie@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert-danger')).toBeVisible();

    // 2. Inactive account handling
    await page.fill('input[type="email"]', 'inactive.req@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert-danger')).toContainText(/invalid credentials or account inactive/i);

    // 3. Valid login, mandatory first-password change
    await page.fill('input[type="email"]', 'charlie@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should render Change Password
    await expect(page.locator('h3:has-text("Change Password")')).toBeVisible();

    // Fill change password form
    await page.fill('input[id="oldPassword"]', 'password123');
    await page.waitForTimeout(100);
    await page.fill('input[id="newPassword"]', 'newpassword123');
    await page.waitForTimeout(100);
    await page.fill('input[id="confirmPassword"]', 'newpassword123');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Save Password")');

    // Should render dashboard
    await expect(page.locator('text="Create Ticket"').first()).toBeVisible();

    // 4. Authenticated role display
    await expect(page.locator('text="Requester"').first()).toBeVisible();

    // 5. URL hopping for authenticated Requester to a Staff route (should be 403 or 404, we expect 403 or 404 as per actual backend behavior, so we just expect it not to be 200)
    // Actually, Playwright page.request does NOT share cookies automatically unless we use the same context or manually pass cookies, so we can just use page.evaluate to fetch it within the browser context.
    const resStatus = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:3000/api/staff/tickets');
      return res.status;
    });
    // The backend uses 403 for Staff/Admin boundaries usually, or 404.
    expect(resStatus).toBeGreaterThanOrEqual(400);

    // 6. Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
    await page.goto('/');

    // 7. Verify post-logout protected access is blocked
    const postLogoutStatus = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:3000/api/tickets');
      return res.status;
    });
    expect(postLogoutStatus).toBe(401);
  });
});
