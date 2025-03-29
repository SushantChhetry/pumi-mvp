import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function summarizeFeedback(feedback: string[]) {
  const prompt = `Cluster and summarize the following user feedback:\n\n${feedback.join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message?.content ?? "No content available";
}
