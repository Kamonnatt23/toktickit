import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function restoreAdminAndCleanUp() {
  const script = `
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function clean() {
      await prisma.user.update({
        where: { email: 'admin@example.com' },
        data: { requiresPasswordChange: true, passwordHash: '$2b$10$T.vM0h0mC3n.y6QpX009r.D1PjP0rG6s.t4Gj4g1z.w.E7G0r6qGy', role: 'Administrator', isActive: true }
      });
      
      await prisma.user.deleteMany({ where: { email: 'newadmin@example.com' } });
    }
    clean().finally(() => prisma.$disconnect());
  `;
  execSync(`node --input-type=module -e "${script.replace(/\n/g, '')}"`, { cwd: '../server' });
}

test.describe('User Administration', () => {
  test.afterAll(() => restoreAdminAndCleanUp());

  test('admin user management lifecycle', async ({ page }) => {
    await page.goto('/');
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

    // Create user
    await page.click('button:has-text("Create User")');
    await page.fill('input[name="name"]', 'New Admin');
    await page.fill('input[name="email"]', 'newadmin@example.com');
    await page.selectOption('select[name="role"]', 'Administrator');
    await page.fill('input[name="initialPassword"]', 'temp123');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=newadmin@example.com')).toBeVisible();

    // Duplicate email rejection
    await page.click('button:has-text("Create User")');
    await page.fill('input[name="name"]', 'Dup Admin');
    await page.fill('input[name="email"]', 'newadmin@example.com');
    await page.selectOption('select[name="role"]', 'Administrator');
    await page.fill('input[name="initialPassword"]', 'temp123');
    await page.click('button:has-text("Save")');
    
    await expect(page.locator('.alert-danger')).toContainText('Email already exists');
    await page.click('button:has-text("Cancel")');

    // Edit user (newadmin)
    const newAdminRow = page.locator('tr:has-text("newadmin@example.com")');
    await newAdminRow.locator('button:has-text("Edit")').click();
    await page.selectOption('select[name="role"]', 'IT Staff');
    await page.click('button:has-text("Save")');
    await expect(newAdminRow).toContainText('IT Staff');

    // Reset initial password
    await newAdminRow.locator('button:has-text("Reset Password")').click();
    await page.waitForSelector('h5:has-text("Reset Password")');
    await page.fill('input[type="password"]', 'resetpw123');
    await page.click('button:has-text("Save")'); 
    await expect(page.locator('h5:has-text("Reset Password")')).toBeHidden();

    // Self-deactivation prevention
    const adminRow = page.locator('tr:has-text("admin@example.com")');
    await adminRow.locator('button:has-text("Edit")').click();
    await page.uncheck('input[type="checkbox"]');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.alert-danger')).toContainText(/Cannot deactivate your own account/i);
    await page.click('button:has-text("Cancel")');

    // Last-active-Administrator safety behavior
    await adminRow.locator('button:has-text("Edit")').click();
    await page.selectOption('select[name="role"]', 'Requester');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.alert-danger')).toContainText(/last active Administrator/i);
    await page.click('button:has-text("Cancel")');
  });
});

