import { expect, test } from 'playwright/test'

test('preserves the original gallery and theme behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Lab', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible()
  const wasDark = await page.locator('html').evaluate((element) => element.classList.contains('dark'))
  await page.keyboard.press('t')
  await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(!wasDark)
})

test('keeps gallery chrome compact and primary actions legible in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 1318, height: 988 })
  await page.goto('/')
  await page.locator('html').evaluate((element) => element.classList.add('dark'))

  const connect = page.getByRole('button', { name: 'Connect design system' })
  await expect(connect).toBeVisible()
  const colors = await connect.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
  }))
  expect(colors.foreground).not.toBe(colors.background)

  const header = page.locator('header')
  const headerBox = await header.boundingBox()
  expect(headerBox?.height).toBe(64)
  expect(headerBox?.x).toBe(0)
  expect(headerBox?.width).toBe(await page.evaluate(() => innerWidth))

  const main = page.locator('main')
  const empty = main.locator('section')
  const mainBox = await main.boundingBox()
  expect(mainBox?.x).toBe(0)
  expect(mainBox?.width).toBe(await page.evaluate(() => innerWidth))
  expect(mainBox?.height).toBe((await empty.boundingBox())?.height)
})
