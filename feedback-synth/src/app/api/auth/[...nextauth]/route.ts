/**
 * NextAuth route handler using the App Router (Next.js 13+).
 *
 * This sets up the authentication endpoint at /api/auth/[...nextauth]
 * using the previously defined `authOptions` config.
 *
 * Both GET and POST requests are handled by the same NextAuth instance,
 * which supports login, callback, and session-related routes.
 *
 * A custom logging wrapper logs the HTTP method and URL of each request.
 */

import NextAuth from 'next-auth';
import { authOptions } from './options';
import type { NextRequest } from 'next/server';

// Wrapped handler with logging; using unknown[] for additional parameters.
const handler = (req: NextRequest, ...args: unknown[]) => {
  console.log('[NextAuth Route Called]', req.method, req.url);
  return NextAuth(authOptions)(req, ...args);
};

export const GET = handler;
export const POST = handler;
