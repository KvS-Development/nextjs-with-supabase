import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Supabase/);
});

test('See if merging incoming tests will run those tests', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Supabase/);
});

test('sign in link', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  
  // Extra wait for CI environment
  if (process.env.CI) {
    await page.waitForTimeout(2000); // Give Next.js time to hydrate
  }
  
  // More specific wait
  await page.waitForSelector('text="Sign in"', { 
    state: 'visible',
    timeout: 5000 
  });
  
  // Click the sign in button
  await page.click('text=/sign in/i');

  // Expects page to have a button with 'Login' visible.
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
});
