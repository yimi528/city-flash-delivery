const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')

function getRouteOrigin(draft) {
  if (!draft) return null
  return draft.service === '帮买' ? (draft.purchaseAddress || draft.pickup) : draft.pickup
}

function getRouteDistance(draft) {
  if (!draft || !draft.dropoff) return 2.6
  const cached = Number(draft.routeDistanceKm || 0)
  if (cached > 0) return cached
  return map.getAddressDistanceKm(getRouteOrigin(draft), draft.dropoff)
}

function getRouteSource(draft) {
  if (draft && draft.routeDistanceSource) return draft.routeDistanceSource
  return map.normalizePoint(getRouteOrigin(draft)) && map.normalizePoint(draft && draft.dropoff) ? '直线估算' : '地址簿距离'
}

function estimateFee(draft) {
  const distance = getRouteDistance(draft)
  const weight = Number(draft.weight || 1)
  const isBuy = draft.service === '帮买'
  const vehicle = draft.cargoOptions || {}
  const usesVehicle = !isBuy && vehicle.vehicleId
  const base = isBuy ? 9 : (usesVehicle ? Number(vehicle.baseFee || 10) : 8)
  const distanceRate = usesVehicle ? Number(vehicle.distanceRate || 3) : 2.4
  const weightRate = usesVehicle ? Number(vehicle.weightRate || 1.8) : 1.2
  const distanceFee = Math.max(distance - 1, 0) * (isBuy ? 2.8 : distanceRate)
  const weightFee = isBuy ? 0 : Math.max(weight - 1, 0) * weightRate
  const urgentFee = draft.service === '1对1急送' ? 5 : 0
  const vehicleFee = usesVehicle ? Number(vehicle.vehicleFee || 0) : 0
  const discount = isBuy ? 4 : 3
  const budget = isBuy ? Number(draft.budget || 0) : 0
  const serviceFee = Math.max(base + distanceFee + weightFee + urgentFee + vehicleFee - discount, 6.9)
  const total = isBuy ? serviceFee + budget : serviceFee
  return {
    distance: distance.toFixed(1),
    base: base.toFixed(1),
    distanceFee: distanceFee.toFixed(1),
    weightFee: weightFee.toFixed(1),
    urgentFee: urgentFee.toFixed(1),
    vehicleFee: vehicleFee.toFixed(1),
    discount: discount.toFixed(1),
    budget: budget.toFixed(1),
    serviceFee: serviceFee.toFixed(1),
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
    pickupDetail: draft.pickup.detail,
    dropoffName: draft.dropoff.name,
    dropoffDetail: draft.dropoff.detail,
    item: draft.item,
    buyItems: draft.buyItems || '',
    budget: Number(draft.budget || 0),
    serviceFee: Number(estimate.serviceFee || estimate.total),
    purchaseAddressName: draft.purchaseAddress ? draft.purchaseAddress.name : draft.pickup.name,
    purchaseAddressDetail: draft.purchaseAddress ? draft.purchaseAddress.detail : draft.pickup.detail,
    vehicleName: draft.service === '帮买' ? '骑手代买' : (draft.cargoOptions ? draft.cargoOptions.vehicleName : '二轮电动'),
    weightLabel: draft.service === '帮买' ? '' : (draft.cargoOptions ? draft.cargoOptions.weightLabel : getWeightLabel(Number(draft.weight || 1))),
    fee: Number(estimate.total),
    distance: Number(estimate.distance),
    eta: draft.routeDuration ? `约 ${draft.routeDuration} 分钟` : '约 20 分钟',
    rider: '等待骑手接单',
    createTime: '刚刚',
    remark: draft.remark
  }
}

function buildBackendPayload(draft) {
  const cargoOptions = draft.cargoOptions || {}
  const purchaseAddress = draft.purchaseAddress || draft.pickup
  return {
    userId: app.globalData.userId,
    service: draft.service,
    item: draft.item,
    pickupAddressId: draft.pickup.id,
    dropoffAddressId: draft.dropoff.id,
    pickup: draft.pickup,
    dropoff: draft.dropoff,
    purchaseAddressId: purchaseAddress ? purchaseAddress.id : '',
    purchase: purchaseAddress,
    buyItems: draft.buyItems || '',
    budget: Number(draft.budget || 0),
    distanceKm: getRouteDistance(draft),
    weightKg: Number(draft.weight || 1),
    vehicleId: cargoOptions.vehicleId || 'ebike',
    cargoOptions,
    routeDistanceSource: draft.routeDistanceSource || getRouteSource(draft),
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
    guarantee: true,
    routeSource: '地址簿距离',
    routeDuration: '',
    isRouteLoading: false
  },

  onShow() {
    const draft = app.globalData.draftOrder
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      draft,
      estimate: estimateFee(draft),
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || ''
    })
    this.refreshRouteEstimate()
  },

  refreshLocalEstimate() {
    const draft = app.globalData.draftOrder
    this.setData({
      draft,
      estimate: estimateFee(draft),
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || ''
    })
  },

  refreshRouteEstimate() {
    const draft = app.globalData.draftOrder
    if (!draft.dropoff) return
    const origin = getRouteOrigin(draft)
    if (!origin) return
    const routeSeq = (this.routeSeq || 0) + 1
    this.routeSeq = routeSeq
    this.setData({ isRouteLoading: true })
    map.estimateDistance(origin, draft.dropoff).then((route) => {
      if (this.routeSeq !== routeSeq) return
      draft.routeDistanceKm = route.distanceKm
      draft.routeDistanceSource = route.source
      draft.routeDuration = route.duration
      this.setData({
        draft,
        estimate: estimateFee(draft),
        routeSource: route.source,
        routeDuration: route.duration,
        isRouteLoading: false
      })
    }).catch(() => {
      if (this.routeSeq === routeSeq) this.setData({ isRouteLoading: false })
    })
  },

  selectItem(event) {
    app.globalData.draftOrder.item = event.currentTarget.dataset.item
    this.refreshLocalEstimate()
  },

  selectWeight(event) {
    const weight = Number(event.currentTarget.dataset.weight)
    app.globalData.draftOrder.weight = weight
    if (app.globalData.draftOrder.cargoOptions) {
      app.globalData.draftOrder.cargoOptions.weight = weight
      app.globalData.draftOrder.cargoOptions.weightLabel = getWeightLabel(weight)
    }
    this.refreshLocalEstimate()
  },

  openCargoOptions() {
    wx.navigateTo({ url: '/pages/cargo-options/cargo-options?from=order-create' })
  },

  inputRemark(event) {
    app.globalData.draftOrder.remark = event.detail.value
  },

  inputBuyItems(event) {
    app.globalData.draftOrder.buyItems = event.detail.value
    this.refreshLocalEstimate()
  },

  inputBudget(event) {
    app.globalData.draftOrder.budget = Number(event.detail.value || 0)
    this.refreshLocalEstimate()
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
    if (draft.service === '帮买' && !String(draft.buyItems || '').trim()) {
      wx.showToast({ title: '请填写想买的商品', icon: 'none' })
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
