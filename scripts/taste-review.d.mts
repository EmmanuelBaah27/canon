export type TasteReviewStatus = {
  total: number
  reviewed: number
  pending: number
  due: boolean
  entries: string[]
}

export function tasteReviewStatus(root: string): TasteReviewStatus
export function markTasteReviewed(root: string): TasteReviewStatus
