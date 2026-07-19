import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[\s=-]/g, '')
  if (!normalized || [...normalized].some((character) => !BASE32_ALPHABET.includes(character))) {
    throw new Error('TOTP secret must be valid Base32')
  }
  let bits = ''
  for (const character of normalized) bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  return Buffer.from(bytes)
}

function codeForCounter(secret: string, counter: number) {
  const payload = Buffer.alloc(8)
  payload.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(payload).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(value).padStart(6, '0')
}

export function verifyTotp(secret: string, submittedCode: string, now = Date.now()) {
  const code = submittedCode.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return null
  const currentCounter = Math.floor(now / 30_000)
  for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
    const expected = Buffer.from(codeForCounter(secret, counter))
    const actual = Buffer.from(code)
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return counter
  }
  return null
}

export function generateTotpCode(secret: string, now = Date.now()) {
  return codeForCounter(secret, Math.floor(now / 30_000))
}

function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error('OPERATOR_TOTP_ENCRYPTION_KEY must contain at least 32 characters')
  return createHash('sha256').update(secret).digest()
}

export function encryptTotpSecret(secret: string, keyMaterial: string) {
  decodeBase32(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv)
  const encrypted = Buffer.concat([cipher.update(secret.toUpperCase().replace(/[\s=-]/g, ''), 'utf8'), cipher.final()])
  return `v1$${iv.toString('base64url')}$${cipher.getAuthTag().toString('base64url')}$${encrypted.toString('base64url')}`
}

export function decryptTotpSecret(encoded: string, keyMaterial: string) {
  const [version, ivValue, tagValue, encryptedValue] = encoded.split('$')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted TOTP secret')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyMaterial), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
}
