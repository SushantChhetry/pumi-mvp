// src/lib/slack/formatSlackMessages.ts
import dayjs from 'dayjs'

export function formatSlackMessages(messages: {
  text: string
  slack_user_id: string
  message_ts: string
}[]) {
  return messages
    .map((msg) => {
      const ts = dayjs.unix(Number(msg.message_ts.split('.')[0])).format('MMM D, h:mm A')
      return `[${ts}] (${msg.slack_user_id}): ${msg.text}`
    })
    .join('\n')
}
