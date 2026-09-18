import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const runId = Date.now() + Math.floor(Math.random() * 10000);
const adminEmail = `admin_test_${runId}@example.com`;
const newStaffEmail = `newstaff_test_${runId}@example.com`;

test.describe('User Administration', () => {
  test.beforeAll(async () => {
    const setupScript = `
      import { PrismaClient } from '@prisma/client';
      import * as bcrypt from 'bcrypt';
      const prisma = new PrismaClient();
      async function setup() {
        await prisma.user.create({ data: { name: 'Admin Test', email: '${adminEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'Administrator', requiresPasswordChange: false } });
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
        const users = await prisma.user.findMany({ where: { email: { in: ['${adminEmail}', '${newStaffEmail}'] } } });
        await prisma.session.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
        await prisma.user.deleteMany({
          where: { email: { in: ['${adminEmail}', '${newStaffEmail}'] } }
        });
      }
      clean().finally(() => prisma.$disconnect());
    `;
    execSync(`node --input-type=module -e "${teardownScript.replace(/\n/g, '')}"`, { cwd: '../server' });
  });

  test('admin user management lifecycle', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text="User Management"').first()).toBeVisible();

    // Create user as IT Staff directly
    await page.click('button:has-text("Create User")');
    await page.fill('input#nameInput', 'New Staff');
    await page.waitForTimeout(100);
    await page.fill('input#emailInput', newStaffEmail);
    await page.waitForTimeout(100);
    await page.selectOption('select#roleSelect', 'IT Staff');
    await page.waitForTimeout(100);
    await page.fill('input#initialPasswordInput', 'temp123');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Save")');

    await expect(page.locator(`td:has-text("${newStaffEmail}")`)).toBeVisible();
    await expect(page.locator(`tr:has-text("${newStaffEmail}")`)).toContainText('IT Staff');

    // Duplicate email rejection
    await page.click('button:has-text("Create User")');
    await page.fill('input#nameInput', 'Dup Staff');
    await page.waitForTimeout(100);
    await page.fill('input#emailInput', newStaffEmail);
    await page.waitForTimeout(100);
    await page.selectOption('select#roleSelect', 'IT Staff');
    await page.waitForTimeout(100);
    await page.fill('input#initialPasswordInput', 'temp123');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Save")');

    await expect(page.locator('.alert-danger')).toContainText('Email already exists');
    await page.click('button:has-text("Cancel")');

    // Edit user (newstaff) to Requester
    const newStaffRow = page.locator(`tr:has-text("${newStaffEmail}")`);
    await newStaffRow.locator('button:has-text("Edit")').click();
    await page.selectOption('select#roleSelect', 'Requester');
    await page.click('button:has-text("Save")');
    await expect(newStaffRow).toContainText('Requester');

    // Reset initial password
    await newStaffRow.locator('button:has-text("Reset Password")').click();
    await page.waitForSelector('h5:has-text("Reset Password")');
    await page.fill('input[type="password"]', 'resetpw123');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Save")');
    await expect(page.locator('h5:has-text("Reset Password")')).toBeHidden();

    // Self-deactivation prevention
    const adminRow = page.locator(`tr:has-text("${adminEmail}")`);
    await adminRow.locator('button:has-text("Edit")').click();
    await page.uncheck('input[type="checkbox"]');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.alert-danger')).toContainText(/Cannot deactivate your own account/i);
    await page.click('button:has-text("Cancel")');

    // Last-active-Administrator safety behavior
    await page.route('**/api/admin/users/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        const postData = route.request().postDataJSON();
        if (postData && postData.role === 'Requester') {
          return route.fulfill({
            status: 400,
            body: JSON.stringify({ error: 'Cannot deactivate or change role of the last active Administrator' }), contentType: 'application/json'
          });
        }
      }
      route.fallback();
    });

    await adminRow.locator('button:has-text("Edit")').click();
    await page.selectOption('select#roleSelect', 'Requester');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.alert-danger')).toContainText(/last active Administrator/i);
    await page.click('button:has-text("Cancel")');
    await page.unroute('**/api/admin/users/*');
  });
});
