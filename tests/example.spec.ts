import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://localhost:3000/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Supabase/);
});

test('get started link', async ({ page }) => {
  await page.goto('http://localhost:3000/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Sign in' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});
