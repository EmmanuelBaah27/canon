import { resolve } from 'node:path'
import { expect, test } from 'playwright/test'

test('connects, creates a source draft in the original specimen shell, and wires Dialkit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect design system' }).click()
  await page.getByRole('textbox').fill(resolve('.'))
  await page.getByRole('button', { name: 'Review repository' }).click()
  await expect(page.getByRole('heading', { name: 'Review design system' })).toBeVisible()
  await page.getByRole('button', { name: 'Approve design system' }).dispatchEvent('click')
  await expect(page.getByText('Design system connected')).toBeVisible()
  await page.getByRole('button', { name: 'New component draft' }).click()
  await page.getByRole('textbox', { name: 'Search components' }).fill('Input')
  await page.getByRole('option', { name: /^Input / }).click()
  await expect(page.getByRole('link', { name: 'Lab' })).toBeVisible()
  await expect(page.getByText(/Source draft/)).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Draft issues' })).toContainText('Issues · 2')
  await expect(page.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Keep' }).click()
  await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0)
})
