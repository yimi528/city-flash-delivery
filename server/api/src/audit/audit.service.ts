import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'

export type AuditEntry = {
  actorId?: string
  actorRole?: string
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry) {
    try {
      return await this.prisma.auditLog.create({ data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue | undefined } })
    } catch (error) {
      this.logger.error(`Failed to persist audit log: ${entry.action}`, error instanceof Error ? error.stack : undefined)
      return null
    }
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    })
  }
}
