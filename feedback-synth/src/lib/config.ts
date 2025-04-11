export const config = {
    openai: {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-3.5-turbo',
      temperature: 0.7
    },
    notion: {
      dbId: process.env.NOTION_DB_ID!
    },
    slack: {
      messageEndpoint: 'https://slack.com/api/chat.postMessage'
    },
    thresholds: {
      queryConfidence: 0.8
    }
  } as const
  
  export const QUERY_TRIGGERS = ['show me', 'list', 'which', 'find', 'what are']