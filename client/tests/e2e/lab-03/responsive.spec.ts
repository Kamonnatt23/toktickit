import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const viewports = [
  { name: 'Desktop', width: 1200, height: 800 },
  { name: 'Tablet', width: 800, height: 1024 },
  { name: 'Mobile', width: 400, height: 800 },
];

test.describe('Responsive UI verification (Lab 3)', () => {
  for (const vp of viewports) {
    test(`takes screenshots at ${vp.name} resolution`, async ({ page }) => {
      const runId = Date.now() + Math.floor(Math.random() * 10000);
      const reqEmail = `resp_req_${runId}@example.com`;
      const staffEmail = `resp_staff_${runId}@example.com`;
      const adminEmail = `resp_admin_${runId}@example.com`;
      const ticketSummary = `Responsive Layout Ticket ${runId}`;

      const setupScript = `
        import { PrismaClient } from '@prisma/client';
        import * as bcrypt from 'bcrypt';
        const prisma = new PrismaClient();
        async function setup() {
          await prisma.user.create({ data: { name: 'Resp Req', email: '${reqEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'Requester', requiresPasswordChange: false } });
          await prisma.user.create({ data: { name: 'Resp Staff', email: '${staffEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'IT Staff', requiresPasswordChange: false } });
          await prisma.user.create({ data: { name: 'Resp Admin', email: '${adminEmail}', passwordHash: await bcrypt.hash('password123', 10), role: 'Administrator', requiresPasswordChange: false } });
          const cat = await prisma.category.findFirst();
          const sys = await prisma.relatedSystem.findFirst();
          const req = await prisma.user.findFirst({ where: { email: '${reqEmail}' } });
          await prisma.ticket.create({
            data: { summary: '${ticketSummary}', description: 'A ticket specifically for responsive testing', priority: 'High', itPriority: 'High', categoryId: cat.id, relatedSystemId: sys.id, requesterId: req.id }
          });
        }
        setup().finally(() => prisma.$disconnect());
      `;
      execSync(`node --input-type=module -e "${setupScript.replace(/\n/g, '')}"`, { cwd: '../server' });

      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');

        await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();

        // 1. Requester Workflow
        await page.fill('input[type="email"]', reqEmail);
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('text="Create Ticket"').first()).toBeVisible();
        await page.screenshot({ path: `../artifacts/lab-03/screenshots/Requester-Dashboard-${vp.name}.png`, fullPage: true });

        await page.click('button[title="Logout"]');
        await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
        await page.goto('/');

        // 2. Staff Workflow
        await page.fill('input[type="email"]', staffEmail);
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('h4:has-text("Staff Ticket Queue")')).toBeVisible();
        await page.screenshot({ path: `../artifacts/lab-03/screenshots/Staff-Queue-${vp.name}.png`, fullPage: true });



        await page.click('button[title="Logout"]');
        await expect(page.locator('text="Sign in to IT Service Desk"')).toBeVisible();
        await page.goto('/');

        // 3. Admin Workflow
        await page.fill('input[type="email"]', adminEmail);
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('text="User Management"').first()).toBeVisible();
        await page.screenshot({ path: `../artifacts/lab-03/screenshots/User-Management-${vp.name}.png`, fullPage: true });
        console.log(`Saved User-Management-${vp.name}.png`);

      } finally {
        const teardownScript = `
          import { PrismaClient } from '@prisma/client';
          const prisma = new PrismaClient();
          async function clean() {
            await prisma.ticket.deleteMany({ where: { summary: '${ticketSummary}' } });
            const users = await prisma.user.findMany({ where: { email: { in: ['${reqEmail}', '${staffEmail}', '${adminEmail}'] } } });
            await prisma.session.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
            await prisma.user.deleteMany({
              where: { email: { in: ['${reqEmail}', '${staffEmail}', '${adminEmail}'] } }
            });
          }
          clean().finally(() => prisma.$disconnect());
        `;
        execSync(`node --input-type=module -e "${teardownScript.replace(/\n/g, '')}"`, { cwd: '../server' });
      }
    });
  }
});
