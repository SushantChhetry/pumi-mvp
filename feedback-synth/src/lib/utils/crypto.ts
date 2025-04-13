// File: lib/utils/crypto.ts
import crypto from 'crypto'

// Ensure that you set ENCRYPTION_KEY and ENCRYPTION_IV in your environment variables
// ENCRYPTION_KEY should be a 64-character hex string (i.e. 32 bytes)
// ENCRYPTION_IV should be a 32-character hex string (i.e. 16 bytes)
const algorithm = 'aes-256-cbc'
const encryptionKey = process.env.ENCRYPTION_KEY || ''
const iv = process.env.ENCRYPTION_IV || ''

export function encrypt(text: string): string {
  const keyBuffer = Buffer.from(encryptionKey, 'hex')
  const ivBuffer = Buffer.from(iv, 'hex')
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, ivBuffer)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return encrypted
}

export function decrypt(encryptedText: string): string {
  const keyBuffer = Buffer.from(encryptionKey, 'hex')
  const ivBuffer = Buffer.from(iv, 'hex')
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, ivBuffer)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
