import type { ApiOrder, BackendStatus, ConfigCategory, ConfigEnvelope, DashboardPayload, Order, PricingConfig, RiderApplication, ServiceAreaConfig, Stats, Store, SystemSettingsConfig } from './types'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
export const DEFAULT_API_BASE = configuredApiBase || 'http://127.0.0.1:3000/api'
export const DEFAULT_OPERATOR_ID = 'operator-demo'

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待接单',
  ACCEPTED: '已接单',
  PICKING_UP: '取货中',
  DELIVERING: '配送中',
  COMPLETED: '已完成',
  CANCELLED: '已取消'
}

const STATUS_VALUES: Record<string, BackendStatus> = {
  待接单: 'PENDING',
  已接单: 'ACCEPTED',
  取货中: 'PICKING_UP',
  配送中: 'DELIVERING',
  已完成: 'COMPLETED',
  已取消: 'CANCELLED'
}

const SERVICE_LABELS: Record<string, string> = {
  DELIVERY: '帮送',
  PICKUP: '帮取',
  CARGO: '送货',
  BUY_FOR_ME: '帮买'
}

const VEHICLE_LABELS: Record<string, string> = {
  EBIKE: '二轮车',
  ETRIKE: '货三轮车',
  VAN: '小车'
}

const statusOrder = ['待接单', '已接单', '取货中', '配送中', '已完成']

export function toStatusLabel(status?: string): Order['status'] {
  return (STATUS_LABELS[status || ''] || status || '待接单') as Order['status']
}

export function toStatusValue(status: string): BackendStatus {
  return STATUS_VALUES[status] || 'PENDING'
}

export function nextStatus(status: string) {
  if (status === '待接单') return '已接单'
  if (status === '已接单') return '取货中'
  if (status === '取货中') return '配送中'
  if (status === '配送中') return '已完成'
  return status
}

function serviceProgressText(service: string, status: string) {
  const isMoving = ['搬运', '装卸', '搬家', '搬店'].some((keyword) => service.includes(keyword))
  const isPassenger = ['拼车', '顺风车', '送客'].some((keyword) => service.includes(keyword))
  if (status === '取货中') return isMoving ? '上门途中' : isPassenger ? '前往上车点' : '前往取货'
  if (status === '配送中') return isMoving ? '搬运中' : isPassenger ? '行程中' : '配送中'
  return status
}

export function actionLabel(status: string, service = '') {
  if (status === '待接单') return '接单'
  return ''
}

export function statusClass(status: string) {
  if (status === '待支付') return 'payment'
  if (status === '待商家报价' || status === '待确认报价') return 'ready'
  if (status === '待商家接单') return 'hot'
  if (['待骑手接单', '取货中', '配送中', '前往取货', '上门途中', '搬运中', '前往上车点', '行程中', '已到达取货点', '已到达上车点', '已到达服务地点'].includes(status)) return 'ready'
  if (status === '已完成') return 'done'
  return ''
}

export function formatTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function weightLabel(weight?: number) {
  const value = Number(weight || 1)
  if (value <= 1) return '≤1公斤'
  if (value < 10) return `${value}公斤`
  return `${value}公斤以上`
}

export function normalizeOrder(order: ApiOrder): Order {
  const status = toStatusLabel(order.status)
  const service = order.serviceName || SERVICE_LABELS[order.serviceType || ''] || order.service || '帮送'
  const productFee = Number(order.productFee ?? order.budget ?? 0)
  const fee = Number(order.totalFee ?? order.fee ?? 0)
  const estimatedFee = Number(order.estimatedFee ?? fee)
  const deliveryFee = Number(order.deliveryFee ?? order.serviceFee ?? Math.max(fee - productFee, 0))
  const distance = Number(order.distanceKm ?? order.distance ?? 0)
  const weight = Number(order.weightKg ?? order.weight ?? 1)
  const vehicleName = order.vehicleName || VEHICLE_LABELS[order.vehicleType || ''] || '配送单'
  const quoteStatus = order.quoteStatus || (order.isManualQuote ? 'PENDING' : 'NONE')
  const paymentStatus = order.paymentStatus || 'UNPAID'
  const isPaid = paymentStatus === 'PAID'
  const isManualQuote = Boolean(order.isManualQuote || order.pricingMode === 'manual_quote')
  const isTerminal = status === '已完成' || status === '已取消'
  const fallbackStatus = serviceProgressText(service, status)
  const displayStatus = (order.businessStatusText || (
    status === '已完成' || status === '已取消'
      ? status
      : isManualQuote && (quoteStatus === 'PENDING' || quoteStatus === 'REJECTED')
        ? '待商家报价'
        : isManualQuote && quoteStatus === 'QUOTED'
          ? '待确认报价'
          : !isPaid
            ? '待支付'
            : fallbackStatus
  )) as Order['displayStatus']
  const needsQuote = !isTerminal && isManualQuote && (quoteStatus === 'PENDING' || quoteStatus === 'REJECTED')
  const awaitingQuoteConfirmation = !isTerminal && isManualQuote && quoteStatus === 'QUOTED'
  const quoteAccepted = isManualQuote && quoteStatus === 'ACCEPTED'
  const actionText = !isTerminal && isPaid && (!isManualQuote || quoteAccepted) ? actionLabel(status, service) : ''
  const feeText = quoteStatus === 'PENDING'
    ? `预估￥${estimatedFee}`
    : quoteStatus === 'QUOTED'
      ? `待确认￥${fee}`
      : quoteStatus === 'REJECTED'
        ? '用户已拒绝'
        : `￥${fee}`

  return {
    ...order,
    status,
    displayStatus,
    statusIndex: typeof order.statusIndex === 'number' ? order.statusIndex : Math.max(statusOrder.indexOf(status), 0),
    service,
    fee,
    estimatedFee,
    productFee,
    deliveryFee,
    budget: productFee,
    serviceFee: deliveryFee,
    distance,
    createTime: order.createTime || formatTime(order.createdAt),
    eta: order.eta || (displayStatus === '待支付' ? '等待用户支付' : '约30分钟'),
    displayItems: order.buyItems || order.item || order.itemName || '同城配送物品',
    sourceName: order.pickupName || '取货地址',
    sourceDetail: order.pickupDetail || '',
    sourcePin: service === '帮取' ? '取' : '发',
    vehicleName,
    weightLabel: weightLabel(weight),
    actionText,
    feeText,
    needsQuote,
    awaitingQuoteConfirmation,
    quoteAccepted,
    quoteStatus,
    paymentStatus,
    isPaid
  }
}

export function calcStats(orders: Order[]): Stats {
  return {
    pending: orders.filter((item) => item.displayStatus === '待商家接单').length,
    preparing: orders.filter((item) => item.displayStatus === '待骑手接单').length,
    ready: orders.filter((item) => item.status === '取货中').length,
    delivering: orders.filter((item) => item.status === '配送中').length,
    todayOrders: orders.length,
    revenue: orders.filter((item) => item.isPaid).reduce((sum, item) => sum + Number(item.fee || 0), 0).toFixed(1)
  }
}

export function normalizeDashboard(payload: DashboardPayload | ApiOrder[], operatorId: string) {
  const orders = Array.isArray(payload) ? payload : payload.orders || []
  const normalizedOrders = orders.map(normalizeOrder)
  const fallbackStore: Store = {
    id: operatorId,
    name: '同城速送运营中心',
    category: '自营配送',
    address: '宁德市运营中心',
    status: '营业中'
  }

  return {
    store: Array.isArray(payload) ? fallbackStore : payload.store || fallbackStore,
    orders: normalizedOrders,
    stats: Array.isArray(payload) ? calcStats(normalizedOrders) : payload.stats || calcStats(normalizedOrders),
    updatedAt: Array.isArray(payload) ? undefined : payload.updatedAt
  }
}

export class OperationsApi {
  constructor(private readonly apiBase: string, private readonly token: string) {}

  private headers() {
    const result: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-App-Role': 'operator'
    }
    if (this.token) result.Authorization = `Bearer ${this.token}`
    return result
  }

  private async request<T>(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.apiBase}${path}`, {
      ...options,
      headers: this.headers(),
      body: typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = Array.isArray(data.message) ? data.message.join('；') : data.message || data.error || `HTTP ${response.status}`
      throw new Error(message)
    }
    return data as T
  }

  login(username: string, password: string) {
    return this.request<{ token: string; operator?: { id?: string; username?: string; name?: string } }>('/auth/operator-login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean }>('/auth/operator/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    })
  }

  listOrders() {
    return this.request<DashboardPayload>('/operations/orders')
  }

  updateOrderStatus(orderId: string, status: string) {
    return this.request<ApiOrder>(`/operations/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: toStatusValue(status), note: `运营后台更新为${status}` })
    })
  }

  quoteOrder(orderId: string, quotedFee: number, quoteNote = '') {
    return this.request<ApiOrder>(`/operations/orders/${encodeURIComponent(orderId)}/quote`, {
      method: 'PATCH',
      body: JSON.stringify({ quotedFee, quoteNote })
    })
  }

  listRiderApplications() {
    return this.request<RiderApplication[]>('/operations/riders/applications')
  }

  reviewRider(rider: RiderApplication, approved: boolean, reason = '') {
    const requestedType = rider.application?.requestedVehicleType || 'ETRIKE'
    const requestedTypes = rider.application?.requestedVehicleTypes?.length ? rider.application.requestedVehicleTypes : [requestedType]
    const servicesByVehicle: Record<string, string[]> = {
      EBIKE: ['urgent_delivery', 'pickup', 'buy_for_me'],
      ETRIKE: ['cargo_haul', 'pedicab_delivery'],
      VAN: ['carpool_ride'],
      MANUAL: ['moving_handling']
    }
    const serviceIds = Array.from(new Set(requestedTypes.flatMap((type) => servicesByVehicle[type] || [])))
    if (rider.application?.requestsHandling && !serviceIds.includes('moving_handling')) serviceIds.push('moving_handling')
    return this.request(`/operations/riders/${encodeURIComponent(rider.id)}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status: approved ? 'APPROVED' : 'REJECTED',
        vehicleType: requestedType,
        vehicleTypes: requestedTypes,
        vehicleName: rider.application?.requestedVehicleName || requestedType,
        handlingQualified: Boolean(rider.application?.requestsHandling),
        serviceIds,
        serviceCity: '宁德市',
        maxActiveOrders: 1,
        reason
      })
    })
  }

  listRiders(roleStatus = '', workStatus = '') {
    const query = new URLSearchParams()
    if (roleStatus) query.set('roleStatus', roleStatus)
    if (workStatus) query.set('workStatus', workStatus)
    return this.request<RiderApplication[]>(`/operations/riders${query.toString() ? `?${query.toString()}` : ''}`)
  }

  changeRiderStatus(riderId: string, action: 'suspend' | 'restore' | 'resign', reason: string) {
    return this.request(`/operations/riders/${encodeURIComponent(riderId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
  }

  getConfig<T>(category: ConfigCategory) {
    const path = category === 'PRICING' ? '/v1/admin/pricing' : category === 'SERVICE_AREA' ? '/v1/admin/service-areas' : '/v1/admin/system-settings'
    return this.request<ConfigEnvelope<T>>(path)
  }

  saveConfigDraft(category: ConfigCategory, baseVersion: number, payload: unknown) {
    return this.request<{ category: ConfigCategory; baseVersion: number }>('/v1/admin/config-drafts', {
      method: 'PUT',
      body: JSON.stringify({ category, baseVersion, payload })
    })
  }

  publishConfig(category: ConfigCategory) {
    return this.request<{ category: ConfigCategory; version: number }>('/v1/admin/config-publish', {
      method: 'POST',
      body: JSON.stringify({ category })
    })
  }

  listConfigRevisions(category?: ConfigCategory) {
    return this.request<Array<{ id: string; category: ConfigCategory; version: number; publishedBy: string; publishedAt: string }>>(`/v1/admin/config-revisions${category ? `?category=${category}` : ''}`)
  }
}
