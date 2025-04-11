import { config } from '../config'
import { logger } from '../utils/logger'
import { OpenAIError } from '../errors'
import { getSystemPrompt } from './prompts'

interface GPTOptions {
  mode: 'parse' | 'query'
  text: string
}

export class OpenAIService {
  private readonly apiKey: string

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Missing OpenAI API key')
    this.apiKey = apiKey
  }

  async processText({ mode, text }: GPTOptions): Promise<string> {
    try {
      logger.info('Processing text with OpenAI', { mode, textLength: text.length })

      const response = await fetch(config.openai.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.openai.model,
          temperature: config.openai.temperature,
          messages: [getSystemPrompt(mode), { role: 'user', content: text }]
        })
      })

      if (!response.ok) {
        throw new OpenAIError(`API request failed: ${response.statusText}`, {
          status: response.status
        })
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      logger.error('OpenAI processing failed', { error })
      throw new OpenAIError('Failed to process text with OpenAI', { originalError: error })
    }
  }
}