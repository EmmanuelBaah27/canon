import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { markTasteReviewed, tasteReviewStatus } from './taste-review.mjs'

const judgment = (n) => `- 2026-11-${String(n).padStart(2, '0')} tossed \`draft-${n}\`: reason ${n}\n`

test('taste review becomes due after five unreviewed judgments', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'byolab-taste-review-'))
  try {
    writeFileSync(resolve(root, 'LEDGER.md'), `# Ledger\n\n${[1, 2, 3, 4].map(judgment).join('')}`)
    assert.deepEqual(tasteReviewStatus(root), {
      total: 4,
      reviewed: 0,
      pending: 4,
      due: false,
      entries: [1, 2, 3, 4].map((n) => judgment(n).trim()),
    })

    appendFileSync(resolve(root, 'LEDGER.md'), judgment(5))
    assert.equal(tasteReviewStatus(root).due, true)
    assert.equal(tasteReviewStatus(root).pending, 5)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('marking taste reviewed starts the next five-judgment window', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'byolab-taste-review-'))
  try {
    writeFileSync(resolve(root, 'LEDGER.md'), `# Ledger\n\n${[1, 2, 3, 4, 5].map(judgment).join('')}`)
    markTasteReviewed(root)

    assert.deepEqual(JSON.parse(readFileSync(resolve(root, 'TASTE_REVIEW.json'), 'utf8')), { reviewedEntries: 5 })
    assert.equal(tasteReviewStatus(root).pending, 0)

    for (const n of [6, 7, 8, 9, 10]) appendFileSync(resolve(root, 'LEDGER.md'), judgment(n))
    assert.equal(tasteReviewStatus(root).due, true)
    assert.equal(tasteReviewStatus(root).pending, 5)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
