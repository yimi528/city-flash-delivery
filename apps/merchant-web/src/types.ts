export type BackendStatus = 'PENDING' | 'ACCEPTED' | 'PICKING_UP' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED'
export type StatusLabel = '待接单' | '已接单' | '取货中' | '配送中' | '已完成' | '已取消'
export type DisplayStatusLabel =
  | '待商家报价'
  | '待确认报价'
  | '待支付'
  | '前往取货'
  | '上门途中'
  | '搬运中'
  | '前往上车点'
  | '行程中'
  | StatusLabel
export type BackendService = 'DELIVERY' | 'PICKUP' | 'CARGO' | 'BUY_FOR_ME'
export type BackendVehicle = 'EBIKE' | 'ETRIKE' | 'VAN'

export type RiderApplication = {
  id: string
  name: string
  phone: string
  status: 'PENDING' | 'REJECTED' | 'SUSPENDED' | string
  application?: {
    requestedVehicleType?: 'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'
    requestedVehicleName?: string
    requestsHandling?: boolean
    documentUrls?: string[]
    submittedAt?: string
  }
}

export type ApiOrder = {
  id: string
  orderNo?: string
  userId?: string
  serviceType?: BackendService | string
  serviceName?: string
  service?: string
  status?: BackendStatus | StatusLabel | string
  statusIndex?: number
  businessStatus?: string
  businessStatusText?: DisplayStatusLabel | string
  paymentStatus?: 'UNPAID' | 'PAID' | 'REFUNDED' | 'CLOSED' | string
  vehicleType?: BackendVehicle | string
  vehicleName?: string
  pickupName?: string
  pickupDetail?: string
  pickupContact?: string
  pickupPhone?: string
  dropoffName?: string
  dropoffDetail?: string
  dropoffContact?: string
  dropoffPhone?: string
  item?: string
  itemName?: string
  buyItems?: string
  distanceKm?: number
  distance?: number
  weightKg?: number
  weight?: number
  productFee?: number
  deliveryFee?: number
  budget?: number
  serviceFee?: number
  estimatedFee?: number
  totalFee?: number
  fee?: number
  pricingMode?: string
  isManualQuote?: boolean
  quotedFee?: number | null
  quoteStatus?: 'NONE' | 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | string
  quoteNote?: string
  quoteUpdatedAt?: string | null
  remark?: string
  eta?: string
  createTime?: string
  createdAt?: string
  updatedAt?: string
}

export type Order = ApiOrder & {
  status: StatusLabel
  displayStatus: DisplayStatusLabel
  service: string
  fee: number
  distance: number
  createTime: string
  eta: string
  displayItems: string
  sourceName: string
  sourceDetail: string
  sourcePin: '发' | '取'
  vehicleName: string
  weightLabel: string
  actionText: string
  feeText: string
  needsQuote: boolean
  awaitingQuoteConfirmation: boolean
  quoteAccepted: boolean
  quoteStatus: string
  paymentStatus: string
  isPaid: boolean
}

export type Store = {
  id?: string
  name: string
  category: string
  address: string
  status: string
}

export type DashboardPayload = {
  store?: Store
  orders?: ApiOrder[]
  stats?: Partial<Stats>
  updatedAt?: string
}

export type Stats = {
  pending: number
  preparing: number
  ready: number
  delivering: number
  todayOrders: number
  revenue: string
}
