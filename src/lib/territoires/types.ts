/**
 * Types for API Territoires matching service (Autonome)
 */

// Valid territory types
export type TerritoireType =
  | 'region'
  | 'departement'
  | 'commune'
  | 'epci_cc'
  | 'epci_ca'
  | 'epci_cu'
  | 'epci_metropole'
  | 'epci_ept'
  | 'syndicat'
  | 'syndicat_mixte'
  | 'petr'
  | 'pays'
  | 'pnr'

// Request types
export interface MatchRequest {
  query: string
  hints?: MatchHints
}

export interface MatchHints {
  departement?: string
  region?: string
  type?: TerritoireType | string
}

// Response types
export type MatchResult = MatchSuccess | MatchSuggestions | MatchFailed

export interface MatchSuccess {
  status: 'matched'
  code: string
  confidence: number
  nom: string
  type: string
  departement?: string
  region?: string
  matchSource: 'alias' | 'database' | 'direct'
}

export interface MatchSuggestions {
  status: 'suggestions'
  alternatives: MatchAlternative[]
}

export interface MatchAlternative {
  code: string
  nom: string
  confidence: number
  type: string
  departement?: string
  region?: string
}

export interface MatchFailed {
  status: 'failed'
  message: string
}

// Error types
export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// API Response wrapper
export type MatchResponse = MatchResult | ApiError

// ===== BATCH MATCHING TYPES =====

export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ItemStatus = 'pending' | 'matched' | 'suggestions' | 'failed'

// Batch request input
export interface BatchMatchInput {
  items: BatchMatchInputItem[]
  clientId?: string
  webhookUrl?: string // URL for callback when complete
}

export interface BatchMatchInputItem {
  query: string
  hints?: MatchHints
}

// Batch submission response
export interface BatchSubmitResponse {
  requestId: string
  status: BatchStatus
  totalItems: number
  estimatedDuration: number // seconds
  statusUrl: string
  resultsUrl: string
}

// Batch status response
export interface BatchStatusResponse {
  requestId: string
  status: BatchStatus
  totalItems: number
  processed: number
  matched: number
  suggestions: number
  failed: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  progress: number // 0-100
}

// Batch results response
export interface BatchResultsResponse {
  requestId: string
  status: BatchStatus
  results: BatchResultItem[]
  summary: {
    total: number
    matched: number
    suggestions: number
    failed: number
    successRate: number
  }
}

export interface BatchResultItem {
  index: number
  query: string
  status: ItemStatus
  code?: string
  nom?: string
  type?: string
  confidence?: number
  matchSource?: string
  alternatives?: MatchAlternative[]
  error?: string
}
