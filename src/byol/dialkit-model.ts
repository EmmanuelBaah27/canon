import type { DialConfig } from 'dialkit'
import type { DerivedControl } from '../../packages/runtime/src/control-derivation'

function controlValue(control: DerivedControl) {
  if (control.control === 'switch') return Boolean(control.defaultValue)
  if (control.control === 'slider') return [Number(control.defaultValue ?? control.min ?? 0), control.min ?? 0, control.max ?? 100, 1] as [number, number, number, number]
  if (control.control === 'number') return [Number(control.defaultValue ?? 0), -1000, 1000, 1] as [number, number, number, number]
  if (['segmented', 'select', 'token', 'variant', 'state', 'breakpoint', 'icon', 'slot'].includes(control.control)) return { type: 'select' as const, options: [...(control.options ?? control.tokens ?? [])], default: String(control.defaultValue ?? control.options?.[0] ?? control.tokens?.[0] ?? '') }
  return { type: 'text' as const, default: String(control.defaultValue ?? '') }
}

export function dialConfig(controls: DerivedControl[]): DialConfig {
  const properties: DialConfig = {}
  const advanced: DialConfig = { _collapsed: false }
  for (const control of controls) (control.section === 'advanced' ? advanced : properties)[control.id] = controlValue(control)
  return { Properties: properties, Advanced: advanced }
}
