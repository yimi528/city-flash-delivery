import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const prisma = new PrismaClient()

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const digest = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${digest}`
}

async function run() {
  const username = process.env.OPERATOR_BOOTSTRAP_USERNAME || ''
  const password = process.env.OPERATOR_BOOTSTRAP_PASSWORD || ''
  const name = process.env.OPERATOR_BOOTSTRAP_NAME || 'City Flash Operator'
  if (!username || password.length < 8) {
    throw new Error('Set OPERATOR_BOOTSTRAP_USERNAME and an OPERATOR_BOOTSTRAP_PASSWORD of at least 8 characters.')
  }

  const operator = await prisma.operator.upsert({
    where: { username },
    update: { name, passwordHash: hashPassword(password), enabled: true },
    create: { username, name, passwordHash: hashPassword(password), enabled: true }
  })
  console.log(`Operator ready: ${operator.username} (${operator.id})`)
}

try {
  await run()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
