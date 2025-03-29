import { fetchSlackMessages } from "@/lib/slack";
import { summarizeFeedback } from "@/lib/summarize";
import { NextResponse } from "next/server";

export async function GET() {
  const messages = await fetchSlackMessages();
  const feedback = messages.map((msg: any) => msg.text);
  const summary = await summarizeFeedback(feedback);
  return NextResponse.json({ summary });
}
