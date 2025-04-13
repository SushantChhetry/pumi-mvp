export interface SlackInteractionPayload {
  type?: 'view_submission' | 'block_actions'
  team?: { id: string }
  team_id?: string
  user?: { id: string }
  channel?: { id: string }
  container?: { channel_id: string }
  view?: {
    callback_id?: string
    private_metadata?: string
    state?: {
      values: {
        [blockId: string]: {
          [actionId: string]: {
            value?: string
            selected_option?: { value: string }
          }
        }
      }
    }
  }
  actions?: Array<{
    action_id: string
    value?: string
  }>
  trigger_id?: string
  [key: string]: unknown // Allow additional properties
}

export interface GptData {
  summary?: string
  tag?: string
  urgency?: string
  nextStep?: string
  pageId?: string
  [key: string]: unknown // Allow additional properties
}