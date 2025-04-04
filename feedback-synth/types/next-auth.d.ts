import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    // Add the custom property for the access token
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    // Add the custom property for the access token
    accessToken?: string;
  }
}
