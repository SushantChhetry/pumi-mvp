import { fetchSlackMessages } from "@/lib/slack";
import { NextResponse } from "next/server";

export async function GET() {
  const messages = await fetchSlackMessages();
  const feedback = messages.map((msg: any) => msg.text);
  return NextResponse.json({ feedback });
}
