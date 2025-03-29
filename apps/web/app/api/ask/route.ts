import { fetchSlackMessages } from "@/lib/slack";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  const messages = await fetchSlackMessages();
  const feedback = messages.map((m: any) => m.text).join("\n");

  const prompt = `Here is a list of user feedback:\n\n${feedback}\n\nAnswer the following question based on this feedback:\n${question}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return NextResponse.json({ answer: res.choices[0]?.message?.content ?? "No content available" });
}
