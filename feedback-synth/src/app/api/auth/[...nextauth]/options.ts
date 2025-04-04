/**
 * NextAuth configuration for enabling Slack OAuth login in PuMi.
 *
 * This config:
 * - Uses Slack as the authentication provider
 * - Requests the correct Bot Token scopes configured in the Slack app
 * - Stores the Slack access token in both JWT and session
 * - Redirects to a custom error page when authentication fails
 */

import SlackProvider from 'next-auth/providers/slack';
import { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  // OAuth providers
  providers: [
    SlackProvider({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      authorization: {
        // Use Slack's bot authorization URL
        url: 'https://slack.com/oauth/v2/authorize',
        params: {
          // Must match exactly with Bot Token Scopes in your Slack app
          scope: [
            'channels:read',
            'channels:history',
            'groups:read',
            'groups:history',
            'im:read',
            'mpim:read',
            'chat:write',
            'users:read',
          ].join(' '),
        },
      },
    }),
  ],

  // Secret for encrypting JWTs
  secret: process.env.NEXTAUTH_SECRET,

  // Modify token/session behavior
  callbacks: {
    /**
     * Runs whenever a JWT is created or updated.
     * Adds the Slack access token to the token payload.
     */
    async jwt({ token, account }) {
      if (account?.provider === 'slack') {
        // Use camelCase for consistency
        token.accessToken = account.access_token;
      }
      return token;
    },

    /**
     * Runs whenever a session is created.
     * Exposes the access token in the session object.
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },

  // Custom error page
  pages: {
    error: '/auth/error',
  },
};
