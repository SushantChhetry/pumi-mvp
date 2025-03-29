import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log(body); // or store in a DB
  return NextResponse.json({ success: true });
}
