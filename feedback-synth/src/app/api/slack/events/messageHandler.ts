import { OpenAIService } from '@/lib/ai/openAIService'
import { NotionService } from '@/lib/database/notionClient'
import { SlackMessages } from '@/lib/slack/slackMessages'
import { supabaseClient } from '@/lib/database/supabaseClient'
import { Formatters } from '@/lib/utils/formatters'
import { logger } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'

export class MessageHandler {
  private readonly openAI: OpenAIService
  private readonly notion: NotionService
  private readonly slackMessages: SlackMessages
  private readonly slackUserId: string

  constructor(
    private readonly text: string,
    private readonly channel: string,
    private readonly accessToken: string,
    private readonly userId: string,
    private readonly intent: 'feedback' | 'query' | 'bug',
    private readonly target: 'pumi' | 'customer',
    private readonly teamId: string,
  ) {
    this.openAI = new OpenAIService(process.env.OPENAI_API_KEY!)
    this.notion = new NotionService()
    this.slackMessages = new SlackMessages()
    this.slackUserId = userId
  }

  async handle() {
    logger.info('Routing message based on intent', {
      text: this.text,
      intent: this.intent,
      target: this.target,
    })

    if (this.intent === 'query') return this.handleQuery()
    return this.handleFeedback()
  }

  private async handleQuery() {
    logger.info('Processing query intent with OpenAI', { textLength: this.text.length })

    const gptResponse = await this.openAI.processText({
      mode: 'query',
      text: this.text,
    })

    logger.info('Received GPT response for query', { gptResponse })

    const filters = this.parseFilters(gptResponse)
    logger.info('Parsed filters for Notion query', { filters })

    const results = await this.notion.queryDatabase(filters)
    logger.info('Received results from Notion', { count: results.length })

    const slackResponse = await this.slackMessages.send({
      channel: this.channel,
      blocks: Formatters.formatQueryResults(results, filters),
      token: this.accessToken,
    })

    return NextResponse.json({ ok: true, slackResponse })
  }

  private async handleFeedback() {
    logger.info('Processing feedback intent with OpenAI', { textLength: this.text.length })

    try {
      const gptResponse = await this.openAI.processText({
        mode: 'parse',
        text: this.text,
      })

      if (!this.teamId) {
        logger.error('[handleFeedback] Missing teamId in context')
        return NextResponse.json({ ok: false, error: 'Missing team ID' }, { status: 400 })
      }

      logger.info('Received GPT response for feedback', { gptResponse })

      const parsed = Formatters.parseFeedback(gptResponse)

      if (this.intent === 'bug') {
        parsed.tag = 'Bug'
        parsed.urgency = 'High'
        parsed.summary = `[BUG] ${parsed.summary}`
        logger.info('Tagging parsed feedback as bug', { parsed })
      }

      logger.info('Parsed feedback from GPT response', { parsed })

      let notionUrl: string | undefined = undefined

      if (this.target === 'customer') {
        logger.info('[Supabase] getNotionDbIdForTeam called')
        const notionDbId = await supabaseClient.getNotionDbIdForTeam(this.teamId)

        logger.info('[Supabase] getNotionDbIdForTeam result', { notionDbId })

        if (!notionDbId) {
          logger.error('[Notion] No Notion DB found for team', { teamId: this.teamId })
          return NextResponse.json({ ok: false, error: 'Notion DB not found' }, { status: 404 })
        }

        const notionPage = await this.notion.createFeedbackTask(parsed, {
          source: 'Slack',
          metadata: {
            channel: this.channel,
            text: this.text,
            user: this.slackUserId,
          },
          databaseId: notionDbId,
        })

        if ('url' in notionPage) {
          notionUrl = notionPage.url
        }
      } else if (this.target === 'pumi') {
        const { error } = await supabaseClient.saveToPumiFeedback({
          type: this.intent === 'query' ? 'feedback' : this.intent,
          summary: parsed.summary,
          details: this.text,
          user_id: this.slackUserId,
          channel_id: this.channel,
          metadata: {
            urgency: parsed.urgency,
            tag: parsed.tag,
          },
        })

        if (error) {
          logger.error('[Supabase] Failed to store PuMi feedback', error)
        } else {
          logger.info('[Supabase] Stored PuMi feedback successfully')
        }
      }

      const blocks = Formatters.formatFeedbackBlocks(parsed)
      if (notionUrl) {
        logger.info('Adding Notion URL to Slack message blocks', { notionUrl })
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🔗 <${notionUrl}|View in Notion>`,
            },
          ],
        })
      }

      logger.info('Sending feedback message to Slack', { channel: this.channel })

      const slackRes = await this.slackMessages.send({
        channel: this.channel,
        blocks,
        token: this.accessToken,
      })

      logger.info('Slack message sent successfully', { slackRes })
      return NextResponse.json({ ok: true, slackRes })
    } catch (error) {
      logger.error('[Slack] Event handling failed', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null,
      })

      return NextResponse.json({ ok: false, error: 'Unexpected error occurred' }, { status: 500 })
    }
  }

  private parseFilters(gptResponse: string) {
    try {
      return JSON.parse(gptResponse)
    } catch (error) {
      logger.error('Failed to parse GPT filters', { error })
      return {}
    }
  }
}
