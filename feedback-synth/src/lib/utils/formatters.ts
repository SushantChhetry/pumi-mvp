import {
  ParsedFeedback,
  NotionFilter,
  FeedbackTag,
  UrgencyLevel
} from '../types'
import { QUERY_TRIGGERS } from '../config'
import { Validators } from './validators'
import { logger } from './logger'

export interface NotionProperty {
  type: string
  title?: { text?: { content: string } }[]
  rich_text?: { text?: { content: string } }[]
  select?: { name: string }
}

export interface NotionPage {
  properties: Record<string, NotionProperty>
}

export class Formatters {
  static isQueryIntent(text: string): boolean {
    return QUERY_TRIGGERS.some((t) => text.toLowerCase().includes(t))
  }

  static formatFeedbackBlocks(parsed: ParsedFeedback) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:* ${parsed.summary}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Tag:* ${parsed.tag} | *Urgency:* ${parsed.urgency} | *Next Step:* ${parsed.nextStep}`
          }
        ]
      },
      { type: 'divider' }
    ]
  }

  static formatQueryResults(pages: NotionPage[], filters?: NotionFilter) {
    logger.info('Formatting query results for Slack', {
      resultCount: pages.length,
      filters
    })

    if (pages.length === 0) {
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:mag: No results found for the given filters.`
          }
        }
      ]
    }

    const filterText: string[] = []
    if (filters?.tag) filterText.push(`*Tag:* ${filters.tag}`)
    if (filters?.urgency) filterText.push(`*Urgency:* ${filters.urgency}`)
    if (filters?.date_range)
      filterText.push(`*Date:* ${filters.date_range.from} → ${filters.date_range.to}`)

    const headerText =
      filterText.length > 0
        ? `Results for: ${filterText.join(' | ')}`
        : `Showing ${pages.length} result(s)`

    const blocks: any[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `:clipboard: ${headerText}` }
      },
      { type: 'divider' }
    ]

    for (const page of pages) {
      if (!('properties' in page)) {
        logger.warn('Skipping page with no properties', { page })
        continue
      }

      const props = page.properties
      logger.info('Inspecting Notion page properties', { properties: props })

      // Fallback order: Summary.rich_text > dynamic title field
      const titleProp = Object.values(props).find(
        (p: any): p is NotionProperty =>
          p?.type === 'title' && Array.isArray(p.title)
      )

      const summary =
        props?.Summary?.rich_text?.[0]?.text?.content?.trim() ||
        titleProp?.title?.[0]?.text?.content?.trim() ||
        'No summary'

      const tag = props?.Tag?.select?.name || 'Unknown'
      const urgency = props?.Urgency?.select?.name || 'Unknown'

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${summary}*\n• *Tag:* ${tag}\n• *Urgency:* ${urgency}`
        }
      })

      blocks.push({ type: 'divider' })
    }

    return blocks
  }

  static parseFeedback(content: string): ParsedFeedback {
    let parsed: {
      summary: string
      tag: string
      urgency: string
      nextStep: string
    }

    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('Failed to parse GPT response into JSON.')
    }

    const { summary, tag, urgency, nextStep } = parsed

    if (
      typeof summary !== 'string' ||
      typeof tag !== 'string' ||
      typeof urgency !== 'string' ||
      typeof nextStep !== 'string'
    ) {
      throw new Error(
        'Parsed feedback is missing required fields or contains invalid types.'
      )
    }

    if (!Validators.isValidFeedbackTag(tag)) {
      throw new Error(`Invalid tag received: ${tag}`)
    }

    if (!['Low', 'Medium', 'High'].includes(urgency)) {
      throw new Error(`Invalid urgency level: ${urgency}`)
    }

    return {
      summary: summary.trim(),
      tag: tag as FeedbackTag,
      urgency: urgency as UrgencyLevel,
      nextStep: nextStep.trim()
    }
  }
}
