import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ComponentPicker } from './component-picker'

it('uses the original button to launch a command-style component search', () => {
  const html = renderToStaticMarkup(<ComponentPicker components={[{ id: '1', name: 'Input', source: { path: 'src/Input.tsx' } }]} onSelect={() => undefined} />)
  expect(html).toContain('New component draft')
  expect(html).toContain('data-slot="button"')
})
