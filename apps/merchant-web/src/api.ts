import type { ApiOrder, BackendStatus, DashboardPayload, Order, Stats, Store } from './types'

export const DEFAULT_API_BASE = 'http://127.0.0.1:3000/api'
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

export function actionLabel(status: string) {
  if (status === '待接单') return '接单'
  if (status === '已接单') return '开始取货'
  if (status === '取货中') return '开始配送'
  if (status === '配送中') return '完成订单'
  return ''
}

export function statusClass(status: string) {
  if (status === '待接单') return 'hot'
  if (status === '取货中' || status === '配送中') return 'ready'
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
  const deliveryFee = Number(order.deliveryFee ?? order.serviceFee ?? Math.max(fee - productFee, 0))
  const distance = Number(order.distanceKm ?? order.distance ?? 0)
  const weight = Number(order.weightKg ?? order.weight ?? 1)
  const vehicleName = order.vehicleName || VEHICLE_LABELS[order.vehicleType || ''] || '配送单'
  const quoteStatus = order.quoteStatus || (order.isManualQuote ? 'PENDING' : 'NONE')
  const needsQuote = Boolean(order.isManualQuote || order.pricingMode === 'manual_quote') && quoteStatus !== 'QUOTED'
  const actionText = needsQuote ? '' : actionLabel(status)

  return {
    ...order,
    status,
    statusIndex: typeof order.statusIndex === 'number' ? order.statusIndex : Math.max(statusOrder.indexOf(status), 0),
    service,
    fee,
    productFee,
    deliveryFee,
    budget: productFee,
    serviceFee: deliveryFee,
    distance,
    createTime: order.createTime || formatTime(order.createdAt),
    eta: order.eta || '约30分钟',
    displayItems: order.buyItems || order.item || order.itemName || '同城配送物品',
    sourceName: order.pickupName || '取货地址',
    sourceDetail: order.pickupDetail || '',
    sourcePin: service === '帮取' ? '取' : '发',
    vehicleName,
    weightLabel: weightLabel(weight),
    actionText,
    feeText: needsQuote ? '待报价' : `￥${fee}`,
    needsQuote,
    quoteStatus
  }
}

export function calcStats(orders: Order[]): Stats {
  return {
    pending: orders.filter((item) => item.status === '待接单').length,
    preparing: orders.filter((item) => item.status === '已接单').length,
    ready: orders.filter((item) => item.status === '取货中').length,
    delivering: orders.filter((item) => item.status === '配送中').length,
    todayOrders: orders.length,
    revenue: orders.reduce((sum, item) => sum + Number(item.fee || 0), 0).toFixed(1)
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

  login(operatorId: string) {
    return this.request<{ token: string; operator?: { id?: string; name?: string } }>('/auth/operator-login', {
      method: 'POST',
      body: JSON.stringify({ operatorId })
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
}
