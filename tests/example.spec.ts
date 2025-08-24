import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://localhost:3000/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Supabase/);
});

test('sign in link', async ({ page }) => {
  await page.goto('http://localhost:3000/');

  // Click the sign in button
  await page.click('text=/sign in/i');

  // Expects page to have a button with 'Login' visible.
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});
