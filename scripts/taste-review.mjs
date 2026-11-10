import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REVIEW_THRESHOLD = 5
const JUDGMENT = /^- \d{4}-\d{2}-\d{2} (?:kept|tossed) /u

const readJudgments = (root) => {
  const path = resolve(root, 'LEDGER.md')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter((line) => JUDGMENT.test(line))
}

const readReviewedEntries = (root) => {
  const path = resolve(root, 'TASTE_REVIEW.json')
  if (!existsSync(path)) return 0
  const value = JSON.parse(readFileSync(path, 'utf8')).reviewedEntries
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function tasteReviewStatus(root) {
  const judgments = readJudgments(root)
  const reviewed = Math.min(readReviewedEntries(root), judgments.length)
  const entries = judgments.slice(reviewed)
  return {
    total: judgments.length,
    reviewed,
    pending: entries.length,
    due: entries.length >= REVIEW_THRESHOLD,
    entries,
  }
}

export function markTasteReviewed(root) {
  const total = readJudgments(root).length
  writeFileSync(resolve(root, 'TASTE_REVIEW.json'), `${JSON.stringify({ reviewedEntries: total }, null, 2)}\n`)
  return tasteReviewStatus(root)
}
