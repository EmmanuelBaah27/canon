import { useEffect, useMemo, useRef } from 'react'
import { useDialKit } from 'dialkit'
import type { DerivedControl } from '../../packages/runtime/src/control-derivation'
import { dialConfig } from './dialkit-model'

export function SourceDialkit({ draftId, name, controls, onChange }: { draftId: string; name: string; controls: DerivedControl[]; onChange: (values: Record<string, unknown>) => void }) {
  const config = useMemo(() => dialConfig(controls), [controls])
  const values = useDialKit(name, config, { id: `source-${draftId}`, defaultCollapsed: false, persist: { storage: 'sessionStorage' } })
  const previous = useRef('')
  useEffect(() => {
    const serialized = JSON.stringify(values)
    if (serialized !== previous.current) { previous.current = serialized; onChange(values) }
  }, [onChange, values])
  return null
}
