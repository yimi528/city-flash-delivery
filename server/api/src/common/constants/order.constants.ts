export const ORDER_STATUS_FLOW = [
  'PENDING',
  'ACCEPTED',
  'PICKING_UP',
  'DELIVERING',
  'COMPLETED',
] as const

export const SERVICE_TYPES = ['DELIVERY', 'PICKUP', 'CARGO', 'BUY_FOR_ME'] as const
export const VEHICLE_TYPES = ['EBIKE', 'ETRIKE', 'VAN'] as const

export type OrderStatus = (typeof ORDER_STATUS_FLOW)[number]
export type ServiceType = (typeof SERVICE_TYPES)[number]
export type VehicleType = (typeof VEHICLE_TYPES)[number]

export function nextOrderStatus(status: OrderStatus): OrderStatus {
  const index = ORDER_STATUS_FLOW.indexOf(status)
  return ORDER_STATUS_FLOW[Math.min(index + 1, ORDER_STATUS_FLOW.length - 1)]
}
