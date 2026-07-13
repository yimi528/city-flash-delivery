import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AddressesService } from './addresses.service'

describe('AddressesService', () => {
  const now = new Date('2026-07-13T00:00:00.000Z')
  const savedAddress = {
    id: 'address-1',
    userId: 'user-1',
    name: '苍南站',
    detail: '浙江省温州市苍南县灵溪镇站前大道',
    contact: '测试用户',
    phone: '13800000001',
    tag: '常用',
    city: '温州市',
    district: '苍南县',
    adcode: '330327',
    latitude: { toString: () => '27.5364' },
    longitude: { toString: () => '120.4164' },
    location: null,
    mapPoiId: 'poi-cangnan-station',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }
  const addressApi = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  }
  const txAddressApi = {
    count: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  }
  const prisma = {
    address: addressApi,
    $transaction: jest.fn(async (callback) => callback({ address: txAddressApi })),
  }
  const service = new AddressesService(prisma as never)
  const dto = {
    name: '苍南站',
    detail: '浙江省温州市苍南县灵溪镇站前大道',
    contact: '测试用户',
    phone: '13800000001',
    tag: '常用',
    city: '温州市',
    district: '苍南县',
    adcode: '330327',
    latitude: 27.5364,
    longitude: 120.4164,
    mapPoiId: 'poi-cangnan-station',
    isDefault: false,
  }

  beforeEach(() => jest.clearAllMocks())

  it('lists only the authenticated user addresses and normalizes coordinates', async () => {
    addressApi.findMany.mockResolvedValue([savedAddress])

    const result = await service.list('user-1')

    expect(addressApi.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'address-1',
      latitude: 27.5364,
      longitude: 120.4164,
      location: { latitude: 27.5364, longitude: 120.4164 },
    }))
  })

  it('automatically makes the first address default', async () => {
    txAddressApi.count.mockResolvedValue(0)
    txAddressApi.updateMany.mockResolvedValue({ count: 0 })
    txAddressApi.create.mockResolvedValue(savedAddress)

    const result = await service.create('user-1', dto)

    expect(txAddressApi.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isDefault: true },
      data: { isDefault: false },
    })
    expect(txAddressApi.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', isDefault: true, adcode: '330327' }),
    }))
    expect(result.isDefault).toBe(true)
  })

  it('unsets the previous default when another address becomes default', async () => {
    addressApi.findFirst.mockResolvedValue({ ...savedAddress, id: 'address-2', isDefault: false })
    txAddressApi.updateMany.mockResolvedValue({ count: 1 })
    txAddressApi.update.mockResolvedValue({ ...savedAddress, id: 'address-2' })

    await service.update('user-1', 'address-2', { ...dto, isDefault: true })

    expect(addressApi.findFirst).toHaveBeenCalledWith({ where: { id: 'address-2', userId: 'user-1' } })
    expect(txAddressApi.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isDefault: true, id: { not: 'address-2' } },
      data: { isDefault: false },
    })
  })

  it('promotes another address after deleting the default address', async () => {
    addressApi.findFirst.mockResolvedValue(savedAddress)
    txAddressApi.delete.mockResolvedValue(savedAddress)
    txAddressApi.findFirst.mockResolvedValue({ ...savedAddress, id: 'address-2', isDefault: false })
    txAddressApi.update.mockResolvedValue({ ...savedAddress, id: 'address-2' })

    await expect(service.delete('user-1', 'address-1')).resolves.toEqual({ id: 'address-1', deleted: true })
    expect(txAddressApi.update).toHaveBeenCalledWith({ where: { id: 'address-2' }, data: { isDefault: true } })
  })

  it('rejects unowned addresses and incomplete coordinate pairs', async () => {
    addressApi.findFirst.mockResolvedValue(null)

    await expect(service.update('user-1', 'address-other', dto)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create('user-1', { ...dto, longitude: undefined })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.create('user-1', { ...dto, contact: '   ' })).rejects.toBeInstanceOf(BadRequestException)
  })
})
