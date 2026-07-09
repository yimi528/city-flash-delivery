const app = getApp()
const api = require('../../utils/api')

const statusFlow = ['待接单', '已接单', '配送中', '已完成']
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

Page({
  data: {
    statusBarHeight: 24,
    order: null,
    statusFlow,
    activeIndex: 0,
    merchantStatusFlow,
    merchantStatus: '',
    merchantActiveIndex: 0,
    merchantActionText: '',
    isMerchantMode: false
  },

  onLoad(query) {
    this.orderId = query.id
    this.isMerchantMode = query.mode === 'merchant'
  },

  onShow() {
    const order = app.globalData.orders.find((item) => item.id === this.orderId) || app.globalData.orders[0]
    this.applyOrder(order)
    if (app.globalData.useBackend && this.orderId) {
      api.getOrder(this.orderId).then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
      }).catch(() => {})
    }
  },

  applyOrder(order) {
    const merchantStatus = getMerchantStatus(order)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      order,
      activeIndex: order ? order.statusIndex : 0,
      merchantStatus,
      merchantActiveIndex: Math.max(merchantIndex(merchantStatus), 0),
      merchantActionText: getMerchantActionText(order),
      isMerchantMode: Boolean(this.isMerchantMode)
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
    const order = this.data.order
    if (!order || order.status === '已完成' || order.status === '已取消') return

    if (app.globalData.useBackend) {
      api.updateOrderStatus(order.id, { action: 'next' }).then((remoteOrder) => {
        this.cacheOrder(remoteOrder)
        this.applyOrder(remoteOrder)
      }).catch(() => {
        this.nextStatusLocal(order)
      })
      return
    }

    this.nextStatusLocal(order)
  },

  nextStatusLocal(order) {
    const nextIndex = Math.min(order.statusIndex + 1, statusFlow.length - 1)
    order.statusIndex = nextIndex
    order.status = statusFlow[nextIndex]
    if (order.status === '已接单') {
      order.rider = '王师傅'
      order.eta = '约 16 分钟'
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
      updated.statusIndex = 2
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
      statusIndex: 3,
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
    if (!order || order.status === '已完成') return
    order.status = '已取消'
    order.statusIndex = 0
    order.eta = '已取消'
    this.cacheOrder(order)
    this.applyOrder(order)
    wx.showToast({ title: '订单已取消', icon: 'none' })
  },

  callRider() {
    wx.showToast({ title: '演示版暂未接入电话', icon: 'none' })
  },

  goBack() {
    wx.navigateBack()
  }
})
