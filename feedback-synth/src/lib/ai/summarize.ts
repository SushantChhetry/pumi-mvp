import { OpenAI } from 'openai';
import { logger } from '@/lib/utils/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function summarizeText(input: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes Slack conversations into a short product digest.',
        },
        {
          role: 'user',
          content: input,
        },
      ],
      temperature: 0.4,
    });

    const summary = response.choices?.[0]?.message?.content ?? '';
    logger.info('[AI] Summarization completed', { summaryPreview: summary.slice(0, 100) });
    return summary;
  } catch (err) {
    logger.error('[AI] Summarization failed', { error: err });
    return 'Failed to summarize messages.';
  }
}
