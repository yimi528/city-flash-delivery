import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Address, Prisma } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { AddressDto } from './addresses.dto'

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ usageCount: 'desc' }, { lastUsedAt: 'desc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
    return addresses.map((address) => this.toApiAddress(address))
  }

  async create(userId: string, dto: AddressDto) {
    this.validateAddress(dto)
    const address = await this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } })
      const isDefault = Boolean(dto.isDefault || count === 0)
      if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
      return tx.address.create({
        data: {
          userId,
          ...this.addressData(dto),
          isDefault,
        },
      })
    })
    return this.toApiAddress(address)
  }

  async update(userId: string, id: string, dto: AddressDto) {
    this.validateAddress(dto)
    await this.findOwnedAddress(userId, id)
    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }
      return tx.address.update({
        where: { id },
        data: {
          ...this.addressData(dto),
          isDefault: Boolean(dto.isDefault),
        },
      })
    })
    return this.toApiAddress(address)
  }

  async delete(userId: string, id: string) {
    const existing = await this.findOwnedAddress(userId, id)
    const defaultAddressId = await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } })
      if (!existing.isDefault) {
        const currentDefault = await tx.address.findFirst({ where: { userId, isDefault: true }, select: { id: true } })
        return currentDefault?.id || null
      }
      const replacement = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } })
      if (replacement) await tx.address.update({ where: { id: replacement.id }, data: { isDefault: true } })
      return replacement?.id || null
    })
    return { id, deleted: true, defaultAddressId }
  }

  async recordUse(userId: string, id: string) {
    await this.findOwnedAddress(userId, id)
    const address = await this.prisma.address.update({
      where: { id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    return this.toApiAddress(address)
  }

  private findOwnedAddress(userId: string, id: string) {
    return this.prisma.address.findFirst({ where: { id, userId } }).then((address) => {
      if (!address) throw new NotFoundException('地址不存在')
      return address
    })
  }

  private addressData(dto: AddressDto): Prisma.AddressUncheckedCreateWithoutUserInput {
    return {
      name: dto.name.trim(),
      detail: dto.detail.trim(),
      contact: dto.contact.trim(),
      phone: dto.phone.trim(),
      tag: (dto.tag || '').trim(),
      city: (dto.city || '').trim(),
      district: (dto.district || '').trim(),
      adcode: (dto.adcode || '').trim(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      mapPoiId: (dto.mapPoiId || '').trim(),
      isDefault: Boolean(dto.isDefault),
    }
  }

  private validateAddress(dto: AddressDto) {
    if (![dto.name, dto.detail, dto.contact, dto.phone].every((value) => value.trim())) {
      throw new BadRequestException('地址名称、详情、联系人和手机号不能为空')
    }
    if (!/^1[3-9]\d{9}$/.test(dto.phone.trim())) {
      throw new BadRequestException('请输入正确的11位手机号')
    }
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('地址经纬度必须同时填写')
    }
  }

  private toApiAddress(address: Address) {
    const latitude = address.latitude === null ? '' : Number(address.latitude)
    const longitude = address.longitude === null ? '' : Number(address.longitude)
    return {
      id: address.id,
      userId: address.userId,
      name: address.name,
      detail: address.detail,
      contact: address.contact,
      phone: address.phone,
      tag: address.tag,
      city: address.city,
      district: address.district,
      adcode: address.adcode,
      latitude,
      longitude,
      location: latitude !== '' && longitude !== '' ? { latitude, longitude } : null,
      mapPoiId: address.mapPoiId,
      isDefault: address.isDefault,
      usageCount: address.usageCount,
      lastUsedAt: address.lastUsedAt ? address.lastUsedAt.toISOString() : null,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    }
  }
}
