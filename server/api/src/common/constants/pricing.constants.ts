import type { VehicleType } from './order.constants'

export const VEHICLE_PRICING: Record<VehicleType, {
  label: string
  baseFee: number
  distanceRate: number
  weightRate: number
  vehicleFee: number
  maxWeightKg: number
}> = {
  EBIKE: {
    label: '二轮电动',
    baseFee: 10,
    distanceRate: 3,
    weightRate: 1.8,
    vehicleFee: 0,
    maxWeightKg: 10,
  },
  ETRIKE: {
    label: '三轮电动',
    baseFee: 15,
    distanceRate: 3.8,
    weightRate: 1.5,
    vehicleFee: 8,
    maxWeightKg: 80,
  },
  VAN: {
    label: '面包车',
    baseFee: 28,
    distanceRate: 5,
    weightRate: 0.8,
    vehicleFee: 25,
    maxWeightKg: 300,
  },
}
