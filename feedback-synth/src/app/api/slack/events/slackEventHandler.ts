import { SlackEventBody } from '@/lib/types'
import { SupabaseService } from '@/lib/database/supabaseClient'
import { MessageHandler } from './messageHandler'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { AppError } from '@/lib/errors'
import { decrypt } from '@/lib/utils/crypto' // ✅ Decryption helper

export class SlackEventHandler {
  private readonly event: SlackEventBody['event']
  private readonly teamId?: string

  constructor(
    private readonly body: SlackEventBody,
    private readonly supabase: SupabaseService
  ) {
    this.event = body.event
    this.teamId = body.team_id
  }

  private async getPumiHubChannelId(decryptedToken: string): Promise<string | null> {
    try {
      const res = await fetch('https://slack.com/api/conversations.list', {
        method: 'GET',
        headers: { Authorization: `Bearer ${decryptedToken}` }
      })
      const data = await res.json()
      interface SlackChannel {
        id: string;
        name: string;
      }
      return data.channels?.find((c: SlackChannel) => c.name === 'pumi-hub')?.id ?? null
    } catch (err) {
      logger.error('[Slack] Failed to fetch channel list',
        err instanceof Error ? { message: err.message, stack: err.stack } : { error: err })
      return null
    }
  }

  async processEvent() {
    logger.info('Processing Slack message event', {
      user: this.event?.user,
      channel: this.event?.channel,
      text: this.event?.text
    })

    if (!this.isValidMessageEvent()) {
      logger.info('Ignoring non-message event or bot message')
      return this.defaultResponse()
    }

    await this.storeMessage()

    const teamData = await this.supabase.getSlackTeamData(this.teamId || '')
    if (!teamData?.access_token) {
      logger.error('Missing Slack team access token')
      return this.defaultResponse()
    }

    const decryptedToken = decrypt(teamData.access_token) // ✅ Decrypt token

    const hubChannelId = await this.getPumiHubChannelId(decryptedToken)
    const isInHub = this.event?.channel === hubChannelId
    const text = this.event?.text?.trim().toLowerCase() ?? ''

    // ✅ Feedback or bug sent in #pumi-hub → goes to internal pumi_feedback table
    if (isInHub && (text.startsWith('bug:') || text.startsWith('feedback:'))) {
      const intent: 'feedback' | 'bug' = text.startsWith('bug:') ? 'bug' : 'feedback'
      const message = this.event.text!.split(':').slice(1).join(':').trim()

      logger.info(`[Slack] Handling ${intent} command in #pumi-hub`, { message })

      return new MessageHandler(
        message,
        this.event.channel ?? '',
        decryptedToken,
        this.event.user ?? '',
        intent,
        'pumi' // 👈 PuMi's own feedback bucket
      ).handle()
    }

    // 🧠 Bot was mentioned outside hub channel → handle company feedback/query
    return this.handleMessageEvent({
      access_token: decryptedToken,
      bot_user_id: teamData.bot_user_id
    })
  }

  private isValidMessageEvent() {
    return this.event?.type === 'message' &&
           !this.event.bot_id &&
           !!this.event.text
  }

  private stripCommandPrefix(
    intent: 'feedback' | 'query' | 'bug',
    botUserId: string
  ): string {
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
        ts: this.event?.ts
      })
      if (!this.event?.user || !this.event.text || !this.event.channel || !this.event.ts) {
        throw new AppError('Missing required message fields')
      }

      await this.supabase.insertMessage({
        slack_user_id: this.event.user,
        slack_channel_id: this.event.channel,
        text: this.event.text,
        message_ts: this.event.ts,
        team_id: this.teamId || 'unknown'
      })
    } catch (error) {
      logger.error('Failed to store message', { error })
    }
  }

  private async handleMessageEvent(teamData: { access_token: string, bot_user_id: string }) {
    try {
      const intent = this.parseCommandIntent(teamData.bot_user_id)
      logger.info(`Processing Slack message event with intent: ${intent}`)

      if (!intent) {
        logger.info('Message is not a valid PuMi command. Skipping response.')
        return this.defaultResponse()
      }

      logger.info(`Recognized PuMi command intent: ${intent}`)

      return new MessageHandler(
        this.stripCommandPrefix(intent, teamData.bot_user_id),
        this.event?.channel ?? '',
        teamData.access_token,
        this.event?.user ?? '',
        intent,
        'customer' // 👈 company-specific feedback storage
      ).handle()
    } catch (error) {
      logger.error('Message handling failed', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null
      })
      return NextResponse.json(
        { error: 'Failed to process message' },
        { status: 500 }
      )
    }
  }

  private parseCommandIntent(botUserId: string): 'feedback' | 'query' | 'bug' | undefined {
    const mention = `<@${botUserId.toLowerCase()}>`
    const text = this.event?.text?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''

    logger.info('Parsing command intent', { mention, text })

    if (text.startsWith(`${mention} feedback:`)) {
      logger.info('Detected feedback intent')
      return 'feedback'
    } else if (text.startsWith(`${mention} query:`)) {
      logger.info('Detected query intent')
      return 'query'
    } else if (text.startsWith(`${mention} bug:`)) {
      logger.info('Detected bug intent')
      return 'bug'
    }

    logger.info('No valid intent detected')
    return undefined
  }

  private defaultResponse() {
    return NextResponse.json({ ok: true })
  }
}
