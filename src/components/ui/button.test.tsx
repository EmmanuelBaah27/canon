import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Button } from './button'

test('keeps the primary foreground token when compact sizing is applied', () => {
  const html = renderToStaticMarkup(<Button variant="default" size="sm">Connect design system</Button>)

  expect(html).toContain('text-primary-foreground')
  expect(html).toContain('[font-size:var(--text-compact)]')
})
