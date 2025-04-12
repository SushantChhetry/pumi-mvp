// src/app/api/slack/events/slackEventHandler.ts
import { SlackEventBody } from '@/lib/types'
import { SupabaseService } from '@/lib/database/supabaseClient'
import { MessageHandler } from './messageHandler'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { AppError } from '@/lib/errors'

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
    return this.handleMessageEvent()
  }

  private isValidMessageEvent() {
    return this.event?.type === 'message' && 
           !this.event.bot_id && 
           !!this.event.text
  }

  private stripCommandPrefix(intent: 'feedback' | 'query', botUserId: string): string {
    const mention = `<@${botUserId}>`
    const prefix = `${mention} ${intent}:`
    const originalText = this.event?.text ?? ''
    return originalText.replace(prefix, '').trim()
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

  private async handleMessageEvent() {
    try {
      logger.info('Fetching Slack team access token from Supabase')
  
      const teamData = await this.supabase.getSlackTeamData(this.teamId || '')
      if (!teamData?.access_token || !teamData?.bot_user_id) {
        throw new AppError('Missing Slack team credentials')
      }
  
      const intent = this.parseCommandIntent(teamData.bot_user_id)

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
        intent
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
  

  private parseCommandIntent(botUserId: string): 'feedback' | 'query' | undefined {
    const mention = `<@${botUserId}>`
    const text = this.event?.text?.trim().toLowerCase() ?? ''
  
    if (text.startsWith(`${mention} feedback:`)) {
      return 'feedback'
    } else if (text.startsWith(`${mention} query:`)) {
      return 'query'
    }
    return undefined
  }
  

  private defaultResponse() {
    return NextResponse.json({ ok: true })
  }
}