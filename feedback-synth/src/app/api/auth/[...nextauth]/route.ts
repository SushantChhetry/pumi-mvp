import NextAuth from 'next-auth';
import SlackProvider from 'next-auth/providers/slack';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
  }
}

const handler = NextAuth({
  providers: [
    SlackProvider({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      console.log('[JWT CALLBACK] token:', token);
      console.log('[JWT CALLBACK] account:', account);
      if (account?.provider === 'slack') {
        token.access_token = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      console.log('[SESSION CALLBACK] token:', token);
      session.accessToken = token.access_token as string;
      return session;
    },
  },
  
  pages: {
    error: '/auth/error' // Optional: add custom error page
  }
});

export { handler as GET, handler as POST };
