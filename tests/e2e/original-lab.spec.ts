import { expect, test } from 'playwright/test'

test('preserves the original gallery and theme behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Lab', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible()
  const wasDark = await page.locator('html').evaluate((element) => element.classList.contains('dark'))
  await page.keyboard.press('t')
  await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(!wasDark)
})
