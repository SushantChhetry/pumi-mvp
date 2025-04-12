import { OpenAIService } from "@/lib/ai/openAIService"
import { NotionService } from "@/lib/database/notionClient"
import { SlackMessages } from "@/lib/slack/slackMessages"
import { Formatters } from "@/lib/utils/formatters"
import { logger } from "@/lib/utils/logger"
import { NextResponse } from "next/server"

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
    private readonly intent: 'feedback' | 'query'
    
  ) {
    this.openAI = new OpenAIService(process.env.OPENAI_API_KEY!)
    this.notion = new NotionService()
    this.slackMessages = new SlackMessages()
    this.slackUserId = userId
  }

  async handle() {
    logger.info('Routing message based on intent', {
      text: this.text,
      intent: this.intent
    })

    return this.intent === 'query'
    ? this.handleQuery()
    : this.handleFeedback()
  }

  private async handleQuery() {
    logger.info('Processing query intent with OpenAI', { textLength: this.text.length })

    const gptResponse = await this.openAI.processText({
      mode: 'query',
      text: this.text
    })

    logger.info('Received GPT response for query', { gptResponse })


    const filters = this.parseFilters(gptResponse)
    logger.info('Parsed filters for Notion query', { filters })

    const results = await this.notion.queryDatabase(filters)
    logger.info('Received results from Notion', { count: results.length })

    
    const slackResponse = await this.slackMessages.send({
        channel: this.channel,
        blocks: Formatters.formatQueryResults(results, filters),
        token: this.accessToken
      })
    
      return NextResponse.json({ ok: true, slackResponse })
  }

  private async handleFeedback() {
    logger.info('Processing feedback intent with OpenAI', { textLength: this.text.length })

    const gptResponse = await this.openAI.processText({
      mode: 'parse',
      text: this.text
    })
    logger.info('Received GPT response for feedback', { gptResponse })

    const parsed = Formatters.parseFeedback(gptResponse)
    logger.info('Parsed feedback from GPT response', { parsed })

    const notionPage = await this.notion.createFeedbackTask(parsed, {
      source: 'Slack',
      metadata: {
        channel: this.channel,
        text: this.text,
        user: this.slackUserId
      }
    })
    const notionUrl = notionPage?.url
    logger.info('Formatting feedback blocks for Slack message', { parsed })

    const blocks = Formatters.formatFeedbackBlocks(parsed)
    if (notionUrl) {
      logger.info('Adding Notion URL to Slack message blocks', { notionUrl })
      blocks.push({
      type: 'context',
      elements: [
        {
        type: 'mrkdwn',
        text: `🔗 <${notionUrl}|View in Notion>`
        }
      ]
      })
    }
    
    logger.info('Sending feedback message to Slack', { channel: this.channel })
    const slackRes = await this.slackMessages.send({
      channel: this.channel,
      blocks,
      token: this.accessToken
    })
    logger.info('Slack message sent successfully', { slackRes })
    return NextResponse.json({ ok: true, slackRes })
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