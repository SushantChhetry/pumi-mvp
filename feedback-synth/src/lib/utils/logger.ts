export const logger = {
    info: (message: string, meta?: object) => 
      console.log(JSON.stringify({ level: 'INFO', message, ...meta })),
    warn: (message: string, meta?: object) => 
      console.warn(JSON.stringify({ level: 'WARN', message, ...meta })),
    error: (message: string, meta?: object) => 
      console.error(JSON.stringify({ level: 'ERROR', message, ...meta }))
  }