import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { toss } from './verdict.mjs'

test('toss records the judgment without changing curated taste', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'byolab-verdict-'))
  try {
    const draft = resolve(root, 'src/drafts/copy-button')
    mkdirSync(draft, { recursive: true })
    writeFileSync(
      resolve(draft, 'index.ts'),
      "export const specimen = { slug: 'copy-button', ingredients: ['mande'] }\n",
    )
    writeFileSync(resolve(root, 'TASTE.md'), '# Taste\n\n- Compact utilities feel dense.\n')

    toss(root, 'copy-button', 'The card padding feels too generous.')

    assert.equal(readFileSync(resolve(root, 'TASTE.md'), 'utf8'), '# Taste\n\n- Compact utilities feel dense.\n')
    assert.match(
      readFileSync(resolve(root, 'LEDGER.md'), 'utf8'),
      /tossed `copy-button` \(mande\): The card padding feels too generous\./,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
