import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function restoreUser(email) {
  const script = `
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    prisma.user.update({
      where: { email: '${email}' },
      data: { requiresPasswordChange: true, passwordHash: '$2b$10$T.vM0h0mC3n.y6QpX009r.D1PjP0rG6s.t4Gj4g1z.w.E7G0r6qGy' }
    }).then(() => prisma.$disconnect());
  `;
  execSync(`node --input-type=module -e "${script.replace(/\n/g, '')}"`, { cwd: '../server' });
}

test.describe('Authentication Lifecycle', () => {
  test.afterAll(() => restoreUser('charlie@example.com'));

  test('valid login, mandatory password change, logout, and blocked access', async ({ page }) => {
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
    
    // Should render Change Required
    await expect(page.locator('text="Change Required"')).toBeVisible();

    // Fill change password form
    await page.fill('input[id="currentPassword"]', 'password123');
    await page.fill('input[id="newPassword"]', 'newpassword123');
    await page.fill('input[id="confirmPassword"]', 'newpassword123');
    await page.click('button:has-text("Change Password")');

    // Should render dashboard
    await expect(page.locator('text="Create Ticket"').first()).toBeVisible();

    // 4. Authenticated role display
    await expect(page.locator('text="Requester"').first()).toBeVisible();

    // 5. Logout
    await page.click('button[title="Logout"]');
    await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
  });
});

