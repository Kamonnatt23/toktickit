import { test, expect } from '@playwright/test';

test.describe('Main Requester Flow', () => {
  test('completes full ticket lifecycle', async ({ page }) => {
    await page.goto('/');

    // 1. Select Development Requester
    await page.waitForSelector('select'); // DevContext selector
    await page.waitForSelector('select option:nth-child(2)', { state: 'attached' }); // Wait for users to load
    await page.selectOption('select', { index: 1 }); // Select first active requester
    await page.click('button:has-text("Continue as User")');
    
    // 2. Create valid Ticket
    await page.click('button:has-text("Create Ticket")');
    
    // Fill form
    await page.fill('input#summary', 'E2E Test Ticket');
    await page.fill('textarea#description', 'This is an end-to-end test ticket description.');
    await page.selectOption('select#categoryId', { index: 1 });
    await page.selectOption('select#relatedSystemId', { index: 1 });
    await page.selectOption('select#priority', 'High');
    
    // Submit
    await page.click('button:has-text("Submit Ticket")');
    
    // 3. Ticket Number is shown (Wait for success alert)
    await expect(page.locator('.alert-success')).toContainText('successfully', { timeout: 10000 });
    const alertText = await page.locator('.alert-success').innerText();
    const ticketNumMatch = alertText.match(/TKT-\d+/);
    expect(ticketNumMatch).toBeTruthy();
    const ticketNumber = ticketNumMatch![0];

    // 4. Open My Tickets
    await page.click('button:has-text("My Tickets")');
    
    // 5. Search / Filter / Sort / Pagination
    // Wait for card to appear
    await page.waitForTimeout(1000);
    await page.waitForSelector(`.card:has-text("${ticketNumber}")`);
    await expect(page.locator(`.card:has-text("${ticketNumber}")`).last()).toBeVisible();

    // 6. Open Ticket Detail
    await page.locator(`.card:has-text("${ticketNumber}")`).last().click();
    
    // 7. Verify read-only Ticket data
    await expect(page.locator(`span:has-text("${ticketNumber}")`).first()).toBeVisible();
    await expect(page.locator(`text=E2E Test Ticket`).first()).toBeVisible();
    
    // Check if input fields exist (they shouldn't be editable)
    const textInputs = await page.locator('input[type="text"]').count();
    expect(textInputs).toBe(0); // Only file input should exist

    // 8. Attachment flow from Detail
    // Upload
    await page.setInputFiles('input[type="file"]', {
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('test pdf content')
    });
    
    await expect(page.locator('text=test.pdf')).toBeVisible();
    
    // Download is trickier to test in E2E directly via Blob, but we can check if button exists
    await expect(page.locator('button:has-text("Download")')).toBeVisible();
    
    // Soft-remove
    page.on('dialog', dialog => dialog.accept('Test removal reason'));
    await page.click('button:has-text("Remove")');
    
    // Verify removed attachment
    await expect(page.locator('text=Removed: Test removal reason')).toBeVisible();
    
    // Verify removed attachment cannot be downloaded (Download button gone)
    await expect(page.locator('button:has-text("Download")')).toHaveCount(0);
  });
});
