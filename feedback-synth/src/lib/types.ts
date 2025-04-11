export type FeedbackTag = 'Bug' | 'Feature' | 'UX' | 'Other'
export type UrgencyLevel = 'Low' | 'Medium' | 'High'

export interface ParsedFeedback {
  summary: string
  tag: FeedbackTag
  urgency: UrgencyLevel
  nextStep: string
}

export interface NotionFilter {
  tag?: FeedbackTag
  urgency?: UrgencyLevel
  flagged?: boolean
  date_range?: {
    from: string
    to: string
  }
  __debug?: boolean
}

export interface SlackEventBody {
  type: string
  challenge?: string
  event?: {
    type: string
    text?: string
    user?: string
    channel?: string
    bot_id?: string
    ts?: string
  }
  team_id?: string
}