const app = getApp()
const api = require('../../utils/api')
const navigation = require('../../utils/navigation')

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待处理' },
  { key: 'ACTIVE', label: '进行中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' }
]

const PENDING_STATUSES = ['待接单', '待商家接单', '待骑手接单', '待商家报价', '待确认报价', '报价中', '待支付']

function filterKey(value) {
  const text = String(value || '')
  if (!text || text === '全部') return 'ALL'
  if (['ALL', 'PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(text)) return text
  if (PENDING_STATUSES.includes(text) || ['MERCHANT', 'RIDER', 'QUOTE', 'PAYMENT'].includes(text)) return 'PENDING'
  if (text === '已完成') return 'COMPLETED'
  if (text === '已取消') return 'CANCELLED'
  if (text === '已接单' || text === '进行中') return 'ACTIVE'
  if (text === '待处理') return 'PENDING'
  return text
}

function matchesFilter(order, key) {
  const displayStatus = order.displayStatus
  if (key === 'ALL') return true
  if (key === 'PENDING') return PENDING_STATUSES.includes(displayStatus)
  if (key === 'COMPLETED') return displayStatus === '已完成'
  if (key === 'CANCELLED') return displayStatus === '已取消'
  if (key === 'ACTIVE') return ['取货中', '前往取货', '上门途中', '前往上车点', '已到达取货点', '已到达上车点', '已到达服务地点', '配送中', '搬运中', '行程中'].includes(displayStatus)
  return false
}

function statusMeta(order) {
  const status = order.displayStatus
  const map = {
    '待商家接单': { hint: '订单已支付，等待商家确认接单', tone: 'pending' },
    '待骑手接单': { hint: '商家已接单，正在匹配骑手', tone: 'active' },
    '待商家报价': { hint: '商家正在核算服务费用', tone: 'quote' },
    '待确认报价': { hint: '请确认报价后继续下单', tone: 'action' },
    '待支付': { hint: '支付后将立即安排服务', tone: 'action' },
    '已完成': { hint: '服务已完成', tone: 'done' },
    '已取消': { hint: '订单已取消', tone: 'muted' }
  }
  if (map[status]) return map[status]
  return { hint: order.eta || '服务进行中', tone: 'active' }
}

Page({
  data: {
    statusBarHeight: 24,
    orders: [],
    filter: 'ALL',
    filters: FILTERS
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    if (app.globalData.orderFilter) {
      this.setData({ filter: filterKey(app.globalData.orderFilter) })
      app.globalData.orderFilter = ''
    }
    if (!app.globalData.useBackend) {
      this.refresh()
      return
    }
    api.getOrders(app.globalData.userId).then((orders) => {
      app.globalData.orders = orders
      this.refresh(orders)
    }).catch(() => {
      this.refresh()
    })
  },

  refresh(sourceOrders) {
    const filter = filterKey(this.data.filter)
    const allOrders = (sourceOrders || app.globalData.orders).map(api.normalizeOrder)
    const filters = FILTERS.map((item) => Object.assign({}, item, {
      count: item.key === 'ALL' ? allOrders.length : allOrders.filter((order) => matchesFilter(order, item.key)).length
    }))
    const orders = allOrders.filter((item) => matchesFilter(item, filter)).map((item) => {
      const meta = statusMeta(item)
      return Object.assign({}, item, meta, {
        canDelete: item.status === '已完成' || item.status === '已取消',
        feeText: item.feeText || (item.needsQuote ? '待报价' : `¥${item.fee}`),
        orderNoText: item.orderNo ? `订单 ${item.orderNo}` : `下单于 ${item.createTime}`,
        routeLabel: item.dropoffName ? `${item.pickupName} → ${item.dropoffName}` : item.pickupName,
        summaryText: [item.item, item.vehicleName, item.distance ? `${item.distance}km` : ''].filter(Boolean).join(' · ')
      })
    })
    this.setData({ orders, filters, filter })
  },

  changeFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter }, () => this.refresh())
  },

  openOrder(event) {
    navigation.navigateTo(wx, { url: `/pages/order-detail/order-detail?id=${event.currentTarget.dataset.id}` })
  },

  deleteOrder(event) {
    const id = event.currentTarget.dataset.id
    const order = this.data.orders.find((item) => item.id === id)
    if (!order || !order.canDelete) return
    wx.showModal({
      title: '删除这条订单？',
      content: '订单会从“我的订单”中隐藏，履约和售后记录不会被删除。',
      confirmText: '删除',
      confirmColor: '#d4472d',
      success: (result) => {
        if (!result.confirm) return
        const removeLocal = () => {
          app.globalData.orders = (app.globalData.orders || []).filter((item) => item.id !== id)
          this.refresh()
          wx.showToast({ title: '订单已删除', icon: 'success' })
        }
        if (!app.globalData.useBackend) {
          removeLocal()
          return
        }
        wx.showLoading({ title: '删除中' })
        api.deleteOrder(id).then(removeLocal).catch((error) => {
          wx.showToast({ title: error.message || '删除失败，请稍后重试', icon: 'none' })
        }).finally(() => wx.hideLoading())
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
