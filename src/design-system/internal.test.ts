import { expect, test } from 'vitest'
import { internalDesignSystem } from './internal'

test('loads the approved internal contract as immutable data', () => {
  expect(internalDesignSystem.tokens).toEqual(['src/index.css'])
  expect(internalDesignSystem.components).toEqual(['src/components/ui'])
  expect(internalDesignSystem.rules).toEqual([
    'AGENTS.md',
    'TASTE.md',
    'GRID.md',
    'DESIGN_SYSTEM.md',
  ])
  expect(Object.isFrozen(internalDesignSystem)).toBe(true)
  expect(Object.isFrozen(internalDesignSystem.rules)).toBe(true)
  expect(Object.isFrozen(internalDesignSystem.validation)).toBe(true)
})
