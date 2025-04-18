import { SlackEventBody } from '@/lib/types'
import { SupabaseService } from '@/lib/database/supabaseClient'
import { MessageHandler } from './messageHandler'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { AppError } from '@/lib/errors'
import { decrypt } from '@/lib/utils/crypto'

export class SlackEventHandler {
  private readonly event: SlackEventBody['event']
  private readonly teamId?: string

  constructor(
    private readonly body: SlackEventBody,
    private readonly supabase: SupabaseService,
  ) {
    this.event = body.event
    this.teamId = body.team_id
  }

  private async getPumiHubChannelId(decryptedToken: string): Promise<string | null> {
    try {
      const res = await fetch('https://slack.com/api/conversations.list', {
        method: 'GET',
        headers: { Authorization: `Bearer ${decryptedToken}` },
      })
      const data = await res.json()
      return (
        data.channels?.find((c: { id: string; name: string }) => c.name === 'pumi-hub')?.id ?? null
      )
    } catch (err) {
      logger.error(
        '[Slack] Failed to fetch channel list',
        err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
      )
      return null
    }
  }

  async processEvent() {
    logger.info('Processing Slack message event', {
      user: this.event?.user,
      channel: this.event?.channel,
      text: this.event?.text,
    })

    const uniqueEventId = this.body.event_id || this.event?.ts || 'unknown'

    if (!this.isValidMessageEvent()) {
      logger.info('Ignoring non-message event or bot message')
      return this.defaultResponse()
    }

    // Prevent duplicate task creation by checking event_id
    const isDuplicate = await this.supabase.isDuplicateSlackEvent(uniqueEventId)
    if (isDuplicate) {
      logger.warn('[Slack] Duplicate event received. Skipping.', { eventId: uniqueEventId })
      return this.defaultResponse()
    }

    // Mark event as processed
    try {
      await this.supabase.markSlackEventProcessed(uniqueEventId, this.teamId || 'unknown')
    } catch (err) {
      logger.error('[Slack] Failed to mark event as processed', { uniqueEventId, err })
      return this.defaultResponse()
    }

    await this.storeMessage()

    const teamData = await this.supabase.getSlackTeamData(this.teamId || '')
    if (!teamData?.access_token) {
      logger.error('Missing Slack team access token')
      return this.defaultResponse()
    }

    const decryptedToken = decrypt(teamData.access_token)
    const hubChannelId = await this.getPumiHubChannelId(decryptedToken)
    const isInHub = this.event?.channel === hubChannelId
    const rawText = this.event?.text?.trim().toLowerCase() ?? ''
    const cleanedText = rawText.replace(/^<@[^>]+>\s*/, '')

    if (isInHub && (cleanedText.startsWith('bug:') || cleanedText.startsWith('feedback:'))) {
      const intent: 'feedback' | 'bug' = cleanedText.startsWith('bug:') ? 'bug' : 'feedback'
      const message = this.event.text!.split(':').slice(1).join(':').trim()

      await this.sendLoadingMessage(decryptedToken)

      logger.info(`[Slack] Handling ${intent} command in #pumi-hub`, { message })

      return new MessageHandler(
        message,
        this.event.channel ?? '',
        decryptedToken,
        this.event.user ?? '',
        intent,
        'pumi',
        this.teamId || hubChannelId,
      ).handle()
    }

    return this.handleMessageEvent({
      access_token: decryptedToken,
      bot_user_id: teamData.bot_user_id,
    })
  }

  private isValidMessageEvent() {
    return this.event?.type === 'message' && !this.event.bot_id && !!this.event.text
  }

  private stripCommandPrefix(intent: 'feedback' | 'query' | 'bug', botUserId: string): string {
    const mention = `<@${botUserId.toLowerCase()}>`
    const text = this.event?.text?.replace(/\s+/g, ' ').toLowerCase() ?? ''
    const prefix = `${mention} ${intent}:`
    return text.replace(prefix, '').trim()
  }

  private async storeMessage() {
    try {
      logger.info('Storing message in Supabase', {
        user: this.event?.user,
        channel: this.event?.channel,
        text: this.event?.text,
        ts: this.event?.ts,
      })
      if (!this.event?.user || !this.event.text || !this.event.channel || !this.event.ts) {
        throw new AppError('Missing required message fields')
      }

      await this.supabase.insertMessage({
        slack_user_id: this.event.user,
        slack_channel_id: this.event.channel,
        text: this.event.text,
        message_ts: this.event.ts,
        team_id: this.teamId || 'unknown',
      })
    } catch (error) {
      logger.error('Failed to store message', { error })
    }
  }

  private async sendLoadingMessage(token: string) {
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: this?.event?.channel,
          text: '🧠 Processing your feedback... hang tight!',
        }),
      })
    } catch (err) {
      logger.warn(
        'Failed to send loading message',
        err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
      )
    }
  }

  private async handleMessageEvent(teamData: { access_token: string; bot_user_id: string }) {
    try {
      const intent = this.parseCommandIntent(teamData.bot_user_id)
      logger.info(`Processing Slack message event with intent: ${intent}`)

      if (!intent) {
        logger.info('Message is not a valid PuMi command. Skipping response.')
        return this.defaultResponse()
      }

      await this.sendLoadingMessage(teamData.access_token)

      logger.info(`Recognized PuMi command intent: ${intent}`)

      return new MessageHandler(
        this.stripCommandPrefix(intent, teamData.bot_user_id),
        this.event?.channel ?? '',
        teamData.access_token,
        this.event?.user ?? '',
        intent,
        'customer',
        this.teamId || '',
      ).handle()
    } catch (error) {
      logger.error('Message handling failed', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null,
      })
      return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
    }
  }

  private parseCommandIntent(botUserId: string): 'feedback' | 'query' | 'bug' | undefined {
    const mention = `<@${botUserId.toLowerCase()}>`
    const text = this.event?.text?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''

    logger.info('Parsing command intent', { mention, text })

    if (text.startsWith(`${mention} feedback:`)) return 'feedback'
    if (text.startsWith(`${mention} query:`)) return 'query'
    if (text.startsWith(`${mention} bug:`)) return 'bug'

    logger.info('No valid intent detected')
    return undefined
  }

  private defaultResponse() {
    return NextResponse.json({ ok: true })
  }
}
