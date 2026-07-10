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
    label: '二轮车',
    baseFee: 10,
    distanceRate: 1.8,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 10,
  },
  ETRIKE: {
    label: '货三轮车',
    baseFee: 58,
    distanceRate: 5,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 300,
  },
  VAN: {
    label: '小车',
    baseFee: 58,
    distanceRate: 0,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 30,
  },
}
