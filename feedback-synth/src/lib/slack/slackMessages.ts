import { config } from '../config'
import { logger } from '../utils/logger'
import { SlackError } from '../errors'

interface MessagePayload {
  channel: string
  blocks: any[]
  token: string
  text?: string
}

export class SlackMessages {
  async send(payload: MessagePayload) {
    try {
      const response = await fetch(config.slack.messageEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: payload.channel,
          text: payload.text || 'New message',
          blocks: payload.blocks
        })
      })

      if (!response.ok) {
        throw new SlackError(`Slack API error: ${response.statusText}`)
      }

      return response.json()
    } catch (error) {
      logger.error('Failed to send Slack message', { error })
      throw new SlackError('Failed to send message to Slack')
    }
  }
}