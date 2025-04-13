import { Client } from '@notionhq/client'
import { logger } from '@/lib/utils/logger'

const notion = new Client({ auth: process.env.NOTION_SECRET })

export async function createNotionDatabase(teamName: string): Promise<string> {
  try {
    logger.info(`[Notion] Creating DB for team: ${teamName}`)

    const response = await notion.databases.create({
      parent: { type: 'page_id', page_id: process.env.NOTION_PARENT_PAGE_ID! },
      title: [{ type: 'text', text: { content: `${teamName} Feedback Board` } }],
      properties: {
        Name: { title: {} },
        Tag: {
          select: {
            options: [
              { name: 'Bug', color: 'red' },
              { name: 'Feature', color: 'blue' },
              { name: 'UX', color: 'yellow' },
              { name: 'Other', color: 'gray' },
            ],
          },
        },
        Urgency: {
          select: {
            options: [
              { name: 'Low', color: 'green' },
              { name: 'Medium', color: 'orange' },
              { name: 'High', color: 'red' },
            ],
          },
        },
        SlackUser: { rich_text: {} },
        SlackChannel: { rich_text: {} },
        SlackMessageLink: { url: {} },
        NextStep: { rich_text: {} },
      },
    })

    logger.info(`[Notion] DB created: ${response.id}`)
    return response.id
  } catch (err) {
    logger.error(
      '[Notion] Failed to create DB',
      err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
    )
    throw err
  }
}

export async function seedExampleTasks(databaseId: string) {
  const tasks = [
    {
      name: 'Enable /summary command',
      tag: 'Feature',
      urgency: 'Medium',
      nextStep: 'Add GPT logic for summarizing feedback',
    },
    {
      name: 'Fix feedback formatting bug',
      tag: 'Bug',
      urgency: 'High',
      nextStep: 'Escape markdown properly in Slack message blocks',
    },
    {
      name: 'Improve onboarding message',
      tag: 'UX',
      urgency: 'Low',
      nextStep: 'Clarify instructions with screenshots or GIF',
    },
  ]

  for (const task of tasks) {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: task.name } }] },
        Tag: { select: { name: task.tag } },
        Urgency: { select: { name: task.urgency } },
        NextStep: { rich_text: [{ text: { content: task.nextStep } }] },
      },
    })
  }
}
