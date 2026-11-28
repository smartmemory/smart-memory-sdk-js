/** Wire types from smart-memory-graph/contracts/decision-effects.json and the A10 addition. */
type Settlement = { choice: 'replace' } | { choice: 'keep_both_scoped', scope: string }
export type Resolution = Settlement | { choice: 'cancel' }
type Freshness = { kind: 'computed' }
type SuggestedLinks = 'suggest_only' | 'dashed' | 'treat_as_real'

interface EffectsNode {
  id: string
  label: string
  type: 'decision' | 'note' | 'entity'
  hop: number
  validFrom: string
  retiredAt?: string
  retirement?: 'replaced' | 'retracted'
  reason?: string
  rejected?: string[]
  ruleKind?: 'must' | 'must-not'
  check?: 'unchecked'
  importance?: number
  viaSuggested?: boolean
}

interface EffectsEdge {
  id: string
  source: string
  target: string
  type: 'depends_on' | 'comes_from' | 'supersedes'
  derived?: boolean
  freshness?: Freshness
  suggested?: boolean
}

export interface DecisionEffectsSnapshot {
  data: { nodes: EffectsNode[], edges: EffectsEdge[] }
  focus: string
  today: string
  revision?: string
  phase: 'draft' | 'standing' | 'held'
  policy?: 'save' | 'propose'
  replaces: string[]
  conflicts: { id: string, why: string, freshness: Freshness, resolution?: Settlement }[]
  review: { id: string, via: string, hop: number, state: 'preview' | 'flagged', freshness: Freshness }[]
  freshness: Freshness
  whyPaths?: Record<string, string[]>
  counts: { conflicts: number, replaced: number, to_review: number }
  possibly_related: { id: string, label: string }[]
  overflow: { date: string, hop: number, count: number, branchId: string }[]
  suggestedLinks?: SuggestedLinks
  suggestions?: { source: string, target: string, reason: string }[]
}

/** Optional query for a standing decision's ripple. */
export interface StandingEffectsOptions {
  as_of?: string; // YYYY-MM-DD
  show_retired?: boolean;
}
