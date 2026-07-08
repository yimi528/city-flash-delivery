const app = getApp()
const api = require('../../utils/api')

function toNumberDistance(address) {
  if (!address || !address.distance) return 2.6
  return Number(String(address.distance).replace('km', '')) || 2.6
}

function estimateFee(draft) {
  const distance = toNumberDistance(draft.dropoff)
  const weight = Number(draft.weight || 1)
  const isCargo = draft.service === '送货'
  const vehicle = draft.cargoOptions || {}
  const isCar = vehicle.vehicleId === 'car'
  const base = isCargo ? (isCar ? 18 : 10) : 8
  const distanceFee = Math.max(distance - 1, 0) * (isCargo ? (isCar ? 4.2 : 3) : 2.4)
  const weightFee = Math.max(weight - 1, 0) * (isCargo ? 1.8 : 1.2)
  const urgentFee = draft.service === '1对1急送' ? 5 : 0
  const vehicleFee = isCargo ? Number(vehicle.vehicleFee || 0) : 0
  const discount = 3
  const total = Math.max(base + distanceFee + weightFee + urgentFee + vehicleFee - discount, 6.9)
  return {
    distance: distance.toFixed(1),
    base: base.toFixed(1),
    distanceFee: distanceFee.toFixed(1),
    weightFee: weightFee.toFixed(1),
    urgentFee: urgentFee.toFixed(1),
    vehicleFee: vehicleFee.toFixed(1),
    discount: discount.toFixed(1),
    total: total.toFixed(1)
  }
}

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  if (weight < 10) return `${weight}公斤`
  return `${weight}公斤以上`
}

function buildLocalOrder(draft, estimate) {
  return {
    id: `S${Date.now()}`,
    status: '待接单',
    statusIndex: 0,
    service: draft.service,
    pickupName: draft.pickup.name,
    dropoffName: draft.dropoff.name,
    item: draft.item,
    vehicleName: draft.cargoOptions ? draft.cargoOptions.vehicleName : '电动车空间',
    weightLabel: draft.cargoOptions ? draft.cargoOptions.weightLabel : getWeightLabel(Number(draft.weight || 1)),
    fee: Number(estimate.total),
    distance: Number(estimate.distance),
    eta: '约 20 分钟',
    rider: '等待骑手接单',
    createTime: '刚刚',
    remark: draft.remark
  }
}

function buildBackendPayload(draft) {
  const cargoOptions = draft.cargoOptions || {}
  return {
    userId: app.globalData.userId,
    service: draft.service,
    item: draft.item,
    pickupAddressId: draft.pickup.id,
    dropoffAddressId: draft.dropoff.id,
    pickup: draft.pickup,
    dropoff: draft.dropoff,
    distanceKm: toNumberDistance(draft.dropoff),
    weightKg: Number(draft.weight || 1),
    vehicleId: cargoOptions.vehicleId || 'ebike',
    cargoOptions,
    remark: draft.remark || ''
  }
}

function cacheOrder(order) {
  const index = app.globalData.orders.findIndex((item) => item.id === order.id)
  if (index > -1) {
    app.globalData.orders.splice(index, 1, order)
  } else {
    app.globalData.orders.unshift(order)
  }
}

Page({
  data: {
    statusBarHeight: 24,
    draft: {},
    estimate: {},
    itemTypes: ['文件/小件', '鲜花蛋糕', '饮料日用', '数码配件', '家具家纺', '快递包裹'],
    weights: [1, 3, 5, 10, 15],
    guarantee: true
  },

  onShow() {
    const draft = app.globalData.draftOrder
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      draft,
      estimate: estimateFee(draft)
    })
  },

  selectItem(event) {
    app.globalData.draftOrder.item = event.currentTarget.dataset.item
    this.setData({ draft: app.globalData.draftOrder, estimate: estimateFee(app.globalData.draftOrder) })
  },

  selectWeight(event) {
    const weight = Number(event.currentTarget.dataset.weight)
    app.globalData.draftOrder.weight = weight
    if (app.globalData.draftOrder.cargoOptions) {
      app.globalData.draftOrder.cargoOptions.weight = weight
      app.globalData.draftOrder.cargoOptions.weightLabel = getWeightLabel(weight)
    }
    this.setData({ draft: app.globalData.draftOrder, estimate: estimateFee(app.globalData.draftOrder) })
  },

  openCargoOptions() {
    wx.navigateTo({ url: '/pages/cargo-options/cargo-options?from=order-create' })
  },

  inputRemark(event) {
    app.globalData.draftOrder.remark = event.detail.value
  },

  toggleGuarantee() {
    this.setData({ guarantee: !this.data.guarantee })
  },

  submitOrder() {
    const draft = app.globalData.draftOrder
    if (!draft.dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }

    const estimate = estimateFee(draft)
    const submitLocal = (toastTitle) => {
      const order = buildLocalOrder(draft, estimate)
      cacheOrder(order)
      wx.showToast({ title: toastTitle || '下单成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${order.id}` })
      }, 450)
    }

    if (!app.globalData.useBackend) {
      submitLocal('下单成功')
      return
    }

    api.createOrder(buildBackendPayload(draft)).then((order) => {
      cacheOrder(order)
      wx.showToast({ title: '后端下单成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${order.id}` })
      }, 450)
    }).catch(() => {
      submitLocal('已用本地模拟下单')
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
