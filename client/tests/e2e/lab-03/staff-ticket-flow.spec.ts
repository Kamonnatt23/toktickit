import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function restoreStaffAndCleanUp() {
  const script = `
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function clean() {
      await prisma.user.update({
        where: { email: 'staff1@example.com' },
        data: { requiresPasswordChange: true, passwordHash: '$2b$10$T.vM0h0mC3n.y6QpX009r.D1PjP0rG6s.t4Gj4g1z.w.E7G0r6qGy' }
      });
      
      await prisma.internalNote.deleteMany({ where: { content: 'Investigating this issue now.' } });
      await prisma.publicComment.deleteMany({ where: { content: 'We are looking into this.' } });
    }
    clean().finally(() => prisma.$disconnect());
  `;
  execSync(`node --input-type=module -e "${script.replace(/\n/g, '')}"`, { cwd: '../server' });
}

test.describe('Staff Ticket Flow', () => {
  test.afterAll(() => restoreStaffAndCleanUp());

  test('staff queue, triage, and ticket interaction', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'staff1@example.com');
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
    await page.waitForSelector('.card');

    await page.selectOption('select#status-filter', 'Open');
    await page.selectOption('select#sort-select', 'priority:desc');

    const firstTicket = page.locator('.card').first();
    await expect(firstTicket).toBeVisible();
    await firstTicket.click();

    await expect(page.locator('text="Assignee"')).toBeVisible();

    await page.selectOption('select#assignee', { label: 'Staff One' });
    await page.waitForTimeout(1000); 

    await page.selectOption('select#itPriority', 'High');
    await page.waitForTimeout(1000);

    await page.selectOption('select#status', 'In Progress');
    await page.waitForTimeout(1000);

    // Internal Note
    await page.fill('textarea[placeholder="Type your message here..."]', 'Investigating this issue now.');
    await page.check('input#internalNoteSwitch');
    await page.click('button:has-text("Post Message")');
    await expect(page.locator('text=Investigating this issue now.')).toBeVisible();

    // Public Comment
    await page.fill('textarea[placeholder="Type your message here..."]', 'We are looking into this.');
    await page.uncheck('input#internalNoteSwitch');
    await page.click('button:has-text("Post Message")');
    await expect(page.locator('text=We are looking into this.')).toBeVisible();
  });
});

