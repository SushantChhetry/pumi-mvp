export class AppError extends Error {
    constructor(
      public readonly message: string,
      public readonly context?: Record<string, unknown>,
      public readonly isOperational = true
    ) {
      super(message)
      Error.captureStackTrace(this, this.constructor)
    }
  }
  
  export class OpenAIError extends AppError {}
  export class NotionError extends AppError {}
  export class SlackError extends AppError {}