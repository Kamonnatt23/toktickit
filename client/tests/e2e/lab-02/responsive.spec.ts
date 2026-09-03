import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'Desktop', width: 1200, height: 800 },
  { name: 'Tablet', width: 800, height: 1024 },
  { name: 'Mobile', width: 400, height: 800 },
];

async function checkOverflow(page: any) {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasOverflow).toBe(false);
}

test.describe('Responsive UI verification', () => {
  for (const vp of viewports) {
    test(`takes screenshots at ${vp.name} resolution`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Wait for app
      await page.waitForSelector('select');
      await page.waitForSelector('select option:nth-child(2)', { state: 'attached' });
      await page.selectOption('select', { index: 1 });
      await page.click('button:has-text("Continue as User")');

      // Create Ticket
      await page.click('button:has-text("Create Ticket")');
      await page.waitForSelector('input#summary');
      await checkOverflow(page);
      await expect(page.locator('button:has-text("Submit Ticket")')).toBeVisible();
      await page.screenshot({ path: `playwright-report/screenshots/Create-Ticket-${vp.name}.png`, fullPage: true });

      // Actually submit it to ensure data exists for next screens
      await page.fill('input#summary', `Responsive test ${vp.name}`);
      await page.fill('textarea#description', 'Screenshot ticket');
      await page.selectOption('select#categoryId', { index: 1 });
      await page.selectOption('select#relatedSystemId', { index: 1 });
      await page.click('button:has-text("Submit Ticket")');
      await page.waitForSelector('.alert-success');

      // My Tickets
      await page.click('button:has-text("My Tickets")');
      // Wait for table OR empty state
      await page.locator('.card, .text-center.py-5').first().waitFor();
      await page.waitForTimeout(500); // let data load
      await checkOverflow(page);
      await expect(page.locator('h2:has-text("My Tickets")')).toBeVisible();
      await page.screenshot({ path: `playwright-report/screenshots/My-Tickets-${vp.name}.png`, fullPage: true });

      // Ticket Detail
      // Only navigate if cards exist, otherwise skip ticket detail screenshot
      const cardsCount = await page.locator('.card').count();
      if (cardsCount > 1) { // 1 is the outer card, >1 means ticket cards exist
        const firstCard = page.locator('.card:has-text("TKT-")').last();
        await firstCard.waitFor();
        await firstCard.click({ force: true });
        
        await page.waitForSelector('text=Ticket Details');
        await checkOverflow(page);
        await expect(page.locator('text=Ticket Details')).toBeVisible();
        await page.screenshot({ path: `playwright-report/screenshots/Ticket-Detail-${vp.name}.png`, fullPage: true });
      }
    });
  }
});
