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
  if (!username || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(password)) {
    throw new Error('Set a username and a 12+ character password containing upper/lowercase letters, a number and a symbol.')
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
