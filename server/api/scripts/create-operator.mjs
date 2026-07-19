import { PrismaClient } from '@prisma/client'
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'

const prisma = new PrismaClient()

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const digest = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${digest}`
}

function encryptTotpSecret(secret, keyMaterial) {
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, '')
  if (!/^[A-Z2-7]{16,}$/.test(normalized)) throw new Error('OPERATOR_BOOTSTRAP_TOTP_SECRET must be valid Base32.')
  if (keyMaterial.length < 32) throw new Error('OPERATOR_TOTP_ENCRYPTION_KEY must contain at least 32 characters.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(keyMaterial).digest(), iv)
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])
  return `v1$${iv.toString('base64url')}$${cipher.getAuthTag().toString('base64url')}$${encrypted.toString('base64url')}`
}

async function run() {
  const username = process.env.OPERATOR_BOOTSTRAP_USERNAME || ''
  const password = process.env.OPERATOR_BOOTSTRAP_PASSWORD || ''
  const totpSecret = process.env.OPERATOR_BOOTSTRAP_TOTP_SECRET || ''
  const totpEncryptionKey = process.env.OPERATOR_TOTP_ENCRYPTION_KEY || ''
  const name = process.env.OPERATOR_BOOTSTRAP_NAME || 'City Flash Operator'
  if (!username || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(password)) {
    throw new Error('Set a username and a 12+ character password containing upper/lowercase letters, a number and a symbol.')
  }
  const totpSecretEncrypted = encryptTotpSecret(totpSecret, totpEncryptionKey)

  const operator = await prisma.operator.upsert({
    where: { username },
    update: { name, passwordHash: hashPassword(password), totpSecretEncrypted, lastTotpCounter: null, enabled: true },
    create: { username, name, passwordHash: hashPassword(password), totpSecretEncrypted, enabled: true }
  })
  console.log(`Operator ready: ${operator.username} (${operator.id})`)
  console.log(`Add this account to an authenticator: otpauth://totp/${encodeURIComponent(`City Flash:${username}`)}?secret=${encodeURIComponent(totpSecret.replace(/[\s=-]/g, '').toUpperCase())}&issuer=City%20Flash&digits=6&period=30`)
}

try {
  await run()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
