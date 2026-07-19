export type BackendStatus = 'PENDING' | 'ACCEPTED' | 'PICKING_UP' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED'
export type StatusLabel = '待接单' | '已接单' | '取货中' | '配送中' | '已完成' | '已取消'
export type DisplayStatusLabel =
  | '待商家报价'
  | '待确认报价'
  | '待支付'
  | '待商家接单'
  | '待骑手接单'
  | '已到达取货点'
  | '已到达上车点'
  | '已到达服务地点'
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
  userId?: string
  riderId?: string
  name: string
  phone: string
  status: 'PENDING' | 'REJECTED' | 'SUSPENDED' | string
  roleStatus?: 'ACTIVE' | 'SUSPENDED' | 'RESIGNED' | 'DISABLED' | string
  workStatus?: 'OFFLINE' | 'ONLINE' | 'DELIVERING' | 'PAUSED' | string
  online?: boolean
  currentOrders?: Array<{ id: string; orderNo?: string; status: string; serviceName?: string }>
  deliveryCount?: number
  serviceCity?: string
  createdAt?: string
  updatedAt?: string
  vehicles?: Array<{ vehicleType: string; vehicleName: string; enabled: boolean; verified: boolean }>
  application?: {
    requestedVehicleType?: 'EBIKE' | 'ETRIKE' | 'VAN' | 'MANUAL'
    requestedVehicleName?: string
    requestedVehicleTypes?: string[]
    requestsHandling?: boolean
    documentUrls?: string[]
    submittedAt?: string
    reviewedAt?: string
    reviewedBy?: string
    rejectionReason?: string
    applicationStatus?: string
    applicationId?: string
    userId?: string
  }
}

export type ApiOrder = {
  id: string
  orderNo?: string
  userId?: string
  riderId?: string
  customerName?: string
  customerPhone?: string
  riderName?: string
  riderPhone?: string
  arrivedAt?: string | null
  serviceType?: BackendService | string
  serviceName?: string
  service?: string
  status?: BackendStatus | StatusLabel | string
  statusIndex?: number
  businessStatus?: string
  businessStatusText?: DisplayStatusLabel | string
  paymentStatus?: 'UNPAID' | 'PAID' | 'REFUNDING' | 'REFUNDED' | 'CLOSED' | string
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

export type ConfigCategory = 'PRICING' | 'SERVICE_AREA' | 'SYSTEM'

export type PricingRuleConfig = {
  id: string
  serviceId: string
  pricingMode: string
  baseFeeFen: number
  deliveryStartFeeFen: number
  includedDistanceMeters: number
  perKmFen: number
  minimumFeeFen: number
  maxDistanceMeters: number
  serviceSurchargeFen: number
  maxFeeFen: number
  weatherMultiplierBps: number
  enabled: boolean
  version: number
}

export type ServiceRouteConfig = {
  id: string
  serviceId: string
  originName: string
  destinationName: string
  priceUnit: 'PER_PERSON' | 'PER_ORDER'
  unitPriceFen: number
  enabled: boolean
  sortOrder: number
  version: number
}

export type PricingConfig = {
  rules: PricingRuleConfig[]
  routes: ServiceRouteConfig[]
  services: Array<{ id: string; name: string; vehicleType?: string; vehicleName?: string; enabled: boolean; sortOrder: number }>
}

export type ServiceAreaConfig = {
  id: string
  name: string
  enabled: boolean
  boundaryGeoJson?: { type: 'Polygon'; coordinates: number[][][] }
  bindings?: Array<{ serviceId: string }>
  serviceIds?: string[]
  sortOrder: number
  version: number
}

export type SystemSettingsConfig = {
  id: string
  acceptingOrders: boolean
  closureReason: string
  timeZone: string
  weeklyHours: Record<string, Array<{ start: string; end: string }>>
  customerServicePhone: string
  announcementEnabled: boolean
  announcementTitle: string
  announcementContent: string
  quoteValidityMinutes: number
  riderOrderRadiusMeters: number
  riderMaxActiveOrders: number
  allowCancelBeforeClaim: boolean
  version: number
}

export type ConfigEnvelope<T> = {
  category: ConfigCategory
  version: number
  live: T
  draft: { id: string; baseVersion: number; payload: T; updatedBy: string; updatedAt: string } | null
}
