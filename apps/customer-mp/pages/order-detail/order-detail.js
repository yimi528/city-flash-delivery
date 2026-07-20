const app = getApp()
const api = require('../../utils/api')

const SYNC_INTERVAL_MS = 2000
const fulfillmentStatusFlow = ['待商家接单', '待骑手接单', '取货中', '配送中', '已完成']
const merchantStatusFlow = [
  { status: '待接单', label: '接单' },
  { status: '备货中', label: '备货' },
  { status: '待骑手取货', label: '待取' },
  { status: '已交付', label: '交付' }
]

function getMerchantStatus(order) {
  if (!order || order.service !== '帮买') return ''
  return order.merchantStatus || '待接单'
}

function getMerchantActionText(order) {
  if (!order || order.service !== '帮买' || order.status === '已取消' || order.status === '已完成') return ''
  const status = getMerchantStatus(order)
  if (status === '待接单') return '商家接单'
  if (status === '备货中') return '备货完成'
  if (status === '待骑手取货') return '交付骑手'
  if (status === '已交付') return '确认完成'
  return '商家接单'
}

function nextMerchantStatus(status) {
  if (status === '待接单') return '备货中'
  if (status === '备货中') return '待骑手取货'
  if (status === '待骑手取货') return '已交付'
  return status
}

function merchantIndex(status) {
  return merchantStatusFlow.findIndex((item) => item.status === status)
}

function shouldPayOrder(order) {
  if (!order || order.paymentStatus === 'PAID' || order.status === '已取消') return false
  return !order.isManualQuote || order.quoteStatus === 'ACCEPTED'
}

function paymentStatusText(order) {
  if (!order) return '待支付'
  if (order.paymentStatus === 'PAID') return '已支付'
  if (order.paymentStatus === 'REFUNDING') return '退款处理中'
  if (order.paymentStatus === 'REFUNDED') return '已退款'
  if (order.paymentStatus === 'CLOSED') return '已关闭'
  return '待支付'
}

function getBusinessStatusIndex(order) {
  if (!order || order.status === '已取消') return -1
  return getStatusFlow(order).indexOf(order.displayStatus)
}

function getStatusFlow(order) {
  const service = String((order && order.service) || '')
  const isMoving = ['搬运', '装卸', '搬家', '搬店'].some((keyword) => service.indexOf(keyword) !== -1)
  const isPassenger = ['拼车', '顺风车', '送客'].some((keyword) => service.indexOf(keyword) !== -1)
  const pickupStatus = isMoving ? '上门途中' : (isPassenger ? '前往上车点' : '前往取货')
  const arrivedStatus = isMoving ? '已到达服务地点' : (isPassenger ? '已到达上车点' : '已到达取货点')
  const deliveryStatus = isMoving ? '搬运中' : (isPassenger ? '行程中' : '配送中')
  return ['待支付', '待商家接单', '待骑手接单', pickupStatus, arrivedStatus, deliveryStatus, '已完成']
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function syncTimeText() {
  const now = new Date()
  return `已同步 ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

Page({
  data: {
    statusBarHeight: 24,
    order: null,
    statusFlow: ['待支付', '待商家接单', '待骑手接单', '前往取货', '已到达取货点', '配送中', '已完成'],
    activeIndex: 0,
    merchantStatusFlow,
    merchantStatus: '',
    merchantActiveIndex: 0,
    merchantActionText: '',
    isMerchantMode: false,
    isSyncing: false,
    isQuoteResponding: false,
    isPaying: false,
    isCancelling: false,
    canCancel: false,
    canAutoRefundCancellation: false,
    requiresRefundCancellation: false,
    shouldPay: false,
    isLoggedIn: false,
    paymentStatusText: '待支付',
    syncText: '等待同步'
  },

  onLoad(query) {
    this.orderId = query.id
    this.isMerchantMode = app.globalData.appRole === 'merchant' && query.mode === 'merchant'
  },

  onShow() {
    const order = app.globalData.orders.find((item) => item.id === this.orderId) || app.globalData.orders[0]
    this.applyOrder(order)
    this.syncOrder({ silent: false })
    this.startOrderPolling()
  },

  onHide() {
    this.stopOrderPolling()
  },

  onUnload() {
    this.stopOrderPolling()
  },

  onPullDownRefresh() {
    this.syncOrder({ silent: false, toast: true }).then(() => {
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh()
    })
  },

  startOrderPolling() {
    if (!app.globalData.useBackend || !this.orderId || this.orderSyncTimer) return
    this.orderSyncTimer = setInterval(() => {
      this.syncOrder({ silent: true })
    }, SYNC_INTERVAL_MS)
  },

  stopOrderPolling() {
    if (!this.orderSyncTimer) return
    clearInterval(this.orderSyncTimer)
    this.orderSyncTimer = null
  },

  syncOrder(options = {}) {
    if (app.globalData.useBackend && this.orderId) {
      if (this.orderSyncing) return Promise.resolve()
      const silent = Boolean(options.silent)
      const oldStatus = this.data.order ? this.data.order.displayStatus : ''
      this.orderSyncing = true
      if (!silent) this.setData({ isSyncing: true, syncText: '正在同步订单状态...' })
      return api.getOrder(this.orderId).then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
        this.setData({ isSyncing: false, syncText: syncTimeText() })
        if (silent && oldStatus && remoteOrder.displayStatus !== oldStatus) {
          wx.showToast({ title: `订单更新为${remoteOrder.displayStatus}`, icon: 'none' })
        }
        if (options.toast) wx.showToast({ title: '订单状态已同步', icon: 'success' })
        this.orderSyncing = false
      }).catch(() => {
        this.setData({ isSyncing: false, syncText: '同步失败，稍后自动重试' })
        if (options.toast) wx.showToast({ title: '同步失败，请检查后端', icon: 'none' })
        this.orderSyncing = false
      })
    }
    return Promise.resolve()
  },

  applyOrder(order) {
    order = order ? api.normalizeOrder(order) : order
    if (order && order.isManualQuote) {
      const quoteStatus = order.quoteStatus || 'PENDING'
      const isTerminal = order.status === '已完成' || order.status === '已取消'
      order.estimatedFee = Number(order.estimatedFee || order.fee || 0)
      order.needsQuote = !isTerminal && (quoteStatus === 'PENDING' || quoteStatus === 'REJECTED')
      order.needsQuoteConfirmation = !isTerminal && quoteStatus === 'QUOTED'
      order.quoteAccepted = !isTerminal && quoteStatus === 'ACCEPTED'
      order.quoteStatusText = quoteStatus === 'PENDING'
        ? '等待商家报价'
        : quoteStatus === 'QUOTED'
          ? '等待你确认'
          : quoteStatus === 'ACCEPTED'
            ? '已接受'
            : '已拒绝'
      if (!order.feeText) order.feeText = quoteStatus === 'PENDING' ? `预估￥${order.estimatedFee}` : `￥${order.fee}`
    } else if (order && !order.feeText) {
      order.feeText = `￥${order.fee}`
    }
    const merchantStatus = getMerchantStatus(order)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      order,
      statusFlow: getStatusFlow(order),
      activeIndex: getBusinessStatusIndex(order),
      merchantStatus,
      merchantActiveIndex: Math.max(merchantIndex(merchantStatus), 0),
      merchantActionText: getMerchantActionText(order),
      isMerchantMode: Boolean(this.isMerchantMode),
      shouldPay: shouldPayOrder(order),
      canCancel: Boolean(order && order.status !== '已完成' && order.status !== '已取消'),
      canAutoRefundCancellation: Boolean(order && order.paymentStatus === 'PAID' && order.status === '待接单'),
      requiresRefundCancellation: Boolean(order && order.paymentStatus === 'PAID' && order.status !== '待接单'),
      isLoggedIn: Boolean(app.globalData.isLoggedIn && app.globalData.authToken),
      paymentStatusText: paymentStatusText(order)
    })
  },

  manualSync() {
    this.syncOrder({ silent: false, toast: true })
  },

  confirmQuote() {
    this.respondToQuote(true)
  },

  rejectQuote() {
    this.respondToQuote(false)
  },

  respondToQuote(accepted) {
    const order = this.data.order
    if (!order || order.quoteStatus !== 'QUOTED' || this.data.isQuoteResponding) return
    this.setData({ isQuoteResponding: true })
    if (app.globalData.useBackend) {
      const request = accepted ? api.confirmOrderQuote(order.id) : api.rejectOrderQuote(order.id)
      request.then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
        wx.showToast({ title: accepted ? '已接受商家报价' : '已拒绝，等待重新报价', icon: 'none' })
      }).catch((error) => {
        wx.showToast({ title: error.message || '价格确认失败', icon: 'none' })
      }).finally(() => {
        this.setData({ isQuoteResponding: false })
      })
      return
    }

    const updated = Object.assign({}, order, {
      quoteStatus: accepted ? 'ACCEPTED' : 'REJECTED',
      quoteStatusText: accepted ? '已接受' : '已拒绝',
      needsQuote: !accepted,
      needsQuoteConfirmation: false,
      quoteAccepted: accepted,
      feeText: accepted ? `￥${order.fee}` : '已拒绝报价',
      eta: accepted ? '等待运营接单' : '等待商家重新报价'
    })
    this.cacheOrder(updated)
    this.applyOrder(updated)
    this.setData({ isQuoteResponding: false })
    wx.showToast({ title: accepted ? '已接受商家报价' : '已拒绝，等待重新报价', icon: 'none' })
  },

  payOrder() {
    const order = this.data.order
    if (!shouldPayOrder(order) || this.data.isPaying) return
    if (!app.globalData.isLoggedIn || !app.globalData.authToken) {
      wx.showModal({
        title: '登录后支付',
        content: '请先完成微信登录，再返回订单支付商家报价。',
        confirmText: '去登录',
        cancelText: '稍后再说',
        success: (result) => {
          if (result.confirm) wx.switchTab({ url: '/pages/profile/profile' })
        }
      })
      return
    }
    this.setData({ isPaying: true })
    api.createWechatPayment(order.id).then(api.requestWechatPayment).then(() => {
      wx.showToast({ title: '支付成功', icon: 'success' })
      return this.syncOrder({ silent: false })
    }).catch((error) => {
      wx.showToast({ title: error.errMsg || error.message || '支付未完成', icon: 'none' })
    }).finally(() => {
      this.setData({ isPaying: false })
    })
  },

  cacheOrder(order) {
    const index = app.globalData.orders.findIndex((item) => item.id === order.id)
    if (index > -1) {
      app.globalData.orders.splice(index, 1, order)
    } else {
      app.globalData.orders.unshift(order)
    }
  },

  nextStatus() {
    wx.showToast({ title: '订单状态由运营后台更新', icon: 'none' })
  },

  nextStatusLocal(order) {
    const currentIndex = Math.max(fulfillmentStatusFlow.indexOf(order.status), 0)
    const nextIndex = Math.min(currentIndex + 1, fulfillmentStatusFlow.length - 1)
    order.statusIndex = nextIndex
    order.status = fulfillmentStatusFlow[nextIndex]
    if (order.status === '已接单') {
      order.rider = '王师傅'
      order.eta = '约 16 分钟'
    }
    if (order.status === '取货中') {
      order.eta = '正在前往取货'
    }
    if (order.status === '配送中') {
      order.eta = '约 9 分钟'
    }
    if (order.status === '已完成') {
      order.eta = '已送达'
    }
    this.cacheOrder(order)
    this.applyOrder(order)
  },

  advanceMerchantOrder() {
    const order = this.data.order
    if (!order || !this.data.merchantActionText) return

    const current = getMerchantStatus(order)
    if (current === '已交付') {
      this.completeOrderByMerchant(order)
      return
    }

    const nextStatus = nextMerchantStatus(current)
    if (app.globalData.useBackend && order.id.indexOf('M-DEMO') !== 0) {
      api.updateMerchantOrderStatus(order.id, { status: nextStatus }).then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
        wx.showToast({ title: nextStatus, icon: 'none' })
      }).catch(() => {
        this.updateMerchantStatusLocal(order, nextStatus)
      })
      return
    }

    this.updateMerchantStatusLocal(order, nextStatus)
  },

  updateMerchantStatusLocal(order, merchantStatus) {
    const updated = Object.assign({}, order, { merchantStatus })
    if (merchantStatus === '备货中') {
      updated.status = '已接单'
      updated.statusIndex = 1
      updated.rider = '等待骑手取货'
      updated.eta = '商家备货中'
    }
    if (merchantStatus === '待骑手取货') {
      updated.status = '已接单'
      updated.statusIndex = 1
      updated.rider = '王师傅'
      updated.eta = '等待骑手取货'
    }
    if (merchantStatus === '已交付') {
      updated.status = '配送中'
      updated.statusIndex = 3
      updated.rider = '王师傅'
      updated.eta = '约 9 分钟'
    }
    this.cacheOrder(updated)
    this.applyOrder(updated)
    wx.showToast({ title: merchantStatus, icon: 'none' })
  },

  completeOrderByMerchant(order) {
    if (app.globalData.useBackend && order.id.indexOf('M-DEMO') !== 0) {
      api.updateOrderStatus(order.id, { status: '已完成', note: '商家演示确认完成' }).then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
        wx.showToast({ title: '订单已完成', icon: 'success' })
      }).catch(() => {
        this.completeOrderLocal(order)
      })
      return
    }
    this.completeOrderLocal(order)
  },

  completeOrderLocal(order) {
    const updated = Object.assign({}, order, {
      status: '已完成',
      statusIndex: 4,
      merchantStatus: '已交付',
      eta: '已送达',
      rider: order.rider || '王师傅'
    })
    this.cacheOrder(updated)
    this.applyOrder(updated)
    wx.showToast({ title: '订单已完成', icon: 'success' })
  },

  cancelOrder() {
    const order = this.data.order
    if (!order || !this.data.canCancel || this.data.isCancelling) return
    if (this.data.requiresRefundCancellation) {
      wx.showModal({
        title: '申请取消订单',
        content: '商家已经接单或开始服务，取消可能产生服务费用，请联系平台客服处理。',
        confirmText: '去联系客服',
        cancelText: '暂不取消',
        success: (result) => {
          if (!result.confirm) return
          wx.switchTab({ url: '/pages/profile/profile' })
          wx.showToast({ title: '请点击“联系客服”', icon: 'none' })
        }
      })
      return
    }
    const isRefund = this.data.canAutoRefundCancellation
    wx.showModal({
      title: isRefund ? '取消并退款' : '取消订单',
      content: isRefund
        ? '商家尚未接单，确认取消后本次模拟支付将自动退款。'
        : '确认取消这笔订单吗？取消后商家将停止报价和服务安排。',
      confirmText: isRefund ? '确认退款' : '确认取消',
      confirmColor: '#d93025',
      cancelText: '暂不取消',
      success: (result) => {
        if (!result.confirm) return
        if (!app.globalData.useBackend || order.id.indexOf('M-DEMO') === 0) {
          this.cancelOrderLocal(order)
          return
        }
        this.setData({ isCancelling: true })
        api.cancelOrder(order.id).then((remoteOrder) => {
          this.cacheOrder(remoteOrder)
          this.applyOrder(remoteOrder)
          wx.showToast({ title: remoteOrder.paymentStatus === 'REFUNDED' ? '订单已取消并退款' : '订单已取消', icon: 'success' })
        }).catch((error) => {
          wx.showToast({ title: error.message || '取消失败，请稍后重试', icon: 'none' })
        }).finally(() => {
          this.setData({ isCancelling: false })
        })
      }
    })
  },

  cancelOrderLocal(order) {
    const updated = Object.assign({}, order, {
      status: '已取消',
      paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : 'CLOSED',
      statusIndex: 0,
      eta: '已取消'
    })
    this.cacheOrder(updated)
    this.applyOrder(updated)
    wx.showToast({ title: updated.paymentStatus === 'REFUNDED' ? '订单已取消并退款' : '订单已取消', icon: 'success' })
  },

  callRider() {
    const phone = String(this.data.order && this.data.order.riderPhone || '').trim()
    if (!phone) {
      wx.showToast({ title: this.data.order && this.data.order.riderName ? '配送员暂未提供联系电话' : '订单暂未分配配送员', icon: 'none' })
      return
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: (error) => {
        if (error && String(error.errMsg || '').includes('cancel')) return
        wx.showToast({ title: '无法拨打，请稍后重试', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
