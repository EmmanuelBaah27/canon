import { expect, it } from 'vitest'
import { dialConfig } from './dialkit-model'

it('derives actual Dialkit controls and starts Advanced expanded', () => {
  const config = dialConfig([
    { id: 'disabled', label: 'Disabled', control: 'switch', section: 'properties', structural: false, defaultValue: false },
    { id: 'radius', label: 'Radius', control: 'slider', section: 'advanced', structural: false, min: 0, max: 24, defaultValue: 12 },
  ])
  expect(config.Properties).toMatchObject({ disabled: false })
  expect(config.Advanced).toMatchObject({ _collapsed: false, radius: [12, 0, 24, 1] })
})
