const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const serviceConfig = require('../../utils/service-config')
const vehicleConfig = require('../../utils/vehicle-config')

const HANDLING_TYPES = serviceConfig.HANDLING_TYPES

const FIELD_PRESETS = {
  send_parcel: {
    sectionTitle: '货物信息',
    sectionHint: '30kg内，小于1立方米',
    itemTypes: ['文件/小件', '快递包裹', '食品饮料', '数码配件'],
    showWeight: true,
    limitText: '寄货限制：30kg以内，体积小于1立方米',
    remarkPlaceholder: '备注：货物尺寸、件数、取件码、是否易碎'
  },
  carpool_ride: {
    sectionTitle: '乘车信息',
    sectionHint: '固定线路拼车',
    itemTypes: ['1人', '2人', '3人', '带少量行李'],
    showWeight: false,
    limitText: '',
    remarkPlaceholder: '备注：上车时间、乘车人数、行李数量'
  },
  cargo_haul: {
    sectionTitle: '拉货信息',
    sectionHint: '用于判断是否需要装卸',
    itemTypes: ['门店补货', '建材五金', '生鲜果蔬', '家具家电', '多件包裹'],
    showWeight: true,
    limitText: '',
    remarkPlaceholder: '备注：货物尺寸、件数、是否需要装货/卸货/搬楼'
  },
  urgent_delivery: {
    sectionTitle: '急送物品',
    sectionHint: '小件快速送达',
    itemTypes: ['文件/小件', '饮料日用', '鲜花蛋糕', '数码配件'],
    showWeight: true,
    limitText: '',
    remarkPlaceholder: '备注：取件码、门牌号、是否需要电话联系'
  },
  pickup: {
    sectionTitle: '帮取信息',
    sectionHint: '写清取件要求',
    itemTypes: ['快递包裹', '文件证件', '饮料日用', '排队取号'],
    showWeight: true,
    limitText: '',
    remarkPlaceholder: '备注：取件码、联系人、窗口/柜台位置'
  },
  pedicab_delivery: {
    sectionTitle: '送货/送客信息',
    sectionHint: '短途轻便需求',
    itemTypes: ['短途送客', '短途送货', '菜市场物品', '小件行李'],
    showWeight: false,
    limitText: '',
    remarkPlaceholder: '备注：人数/件数、是否需要等候'
  },
  manual_quote: {
    sectionTitle: '搬运需求',
    sectionHint: '选择本次主要服务',
    itemTypes: ['搬家/搬店', '装货', '卸货'],
    showWeight: false,
    limitText: '',
    remarkPlaceholder: '请写清楼层、有无电梯、货物数量、是否需要多人'
  }
}

function getFieldPreset(draft) {
  if (draft && inferPricingMode(draft) === 'manual_quote') return FIELD_PRESETS.manual_quote
  return FIELD_PRESETS[(draft && draft.taskId) || ''] || FIELD_PRESETS.urgent_delivery
}

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

function getWeatherPoint(draft) {
  const target = (draft && draft.dropoff) || getRouteOrigin(draft) || {}
  const location = target.location || {}
  return {
    latitude: target.latitude || location.latitude || '',
    longitude: target.longitude || location.longitude || ''
  }
}

function buildWeatherRisk(reason) {
  return {
    isBadWeather: false,
    badWeather: false,
    multiplier: 1,
    weatherText: '暂无恶劣天气预警',
    reason: reason || '天气预报未触发恶劣天气规则',
    source: 'local-auto-fallback'
  }
}

function formatMoney(value) {
  return Number(value || 0).toFixed(1)
}

function inferPricingMode(draft) {
  if (draft && draft.pricingMode) return draft.pricingMode
  if (!draft) return 'distance_weather'
  if (draft.service === '寄货') return 'fixed_line_parcel'
  if (draft.service === '拼车') return 'fixed_line_ride'
  if (draft.service === '搬运装卸' || draft.service === '搬家/搬店' || draft.service === '装货' || draft.service === '卸货') return 'manual_quote'
  if (draft.service === '急送' || draft.service === '帮取' || draft.service === '帮买' || draft.service === '帮送' || draft.service === '1对1急送') return 'distance_weather'
  return 'distance'
}

function getPricingRule(draft) {
  const vehicle = (draft && draft.cargoOptions) || {}
  const servicePricing = (draft && draft.servicePricing) || {}
  const hasVehicleRule = Boolean(vehicle.vehicleId)
  const hasServiceRule = Number(servicePricing.basePrice || 0) > 0
  return {
    baseDistanceKm: hasServiceRule ? Number(servicePricing.baseDistanceKm || 4) : 4,
    basePrice: hasVehicleRule ? Number(vehicle.baseFee || 0) : (hasServiceRule ? Number(servicePricing.basePrice) : 10),
    extraPerKm: hasVehicleRule ? Number(vehicle.distanceRate || 0) : (hasServiceRule ? Number(servicePricing.extraPerKm || 0) : 1.6),
    badWeatherMultiplier: Number(servicePricing.badWeatherMultiplier || 1.15),
    serviceSurcharge: Number(servicePricing.serviceSurcharge || 0),
    linePriceMultiplier: Number(vehicle.linePriceMultiplier || servicePricing.linePriceMultiplier || 1),
    maxDeliveryFee: Number(vehicle.maxDeliveryFee || servicePricing.maxDeliveryFee || 168)
  }
}

function estimateFee(draft) {
  const distance = getRouteDistance(draft)
  const isBuy = draft && draft.service === '帮买'
  const productFee = isBuy ? Number(draft.budget || 0) : 0
  const pricingMode = inferPricingMode(draft)
  const rule = getPricingRule(draft)
  const selectedLine = (draft && draft.selectedLine) || {}
  const linePrice = Number(selectedLine.price || 0)
  const isFixedLine = pricingMode === 'fixed_line_parcel' || pricingMode === 'fixed_line_ride'
  const isManualQuote = pricingMode === 'manual_quote'
  const badWeather = !!(draft && draft.badWeather)
  let base = 0
  let distanceFee = 0
  let weatherFee = 0
  let serviceFee = 0
  let capDiscount = 0
  let baseTitle = '起步价'
  let distanceFeeTitle = `超出${rule.baseDistanceKm}公里费用`
  let pricingNote = (draft && draft.priceSummary) || '按甲方规则计价'

  if (isFixedLine) {
    base = (linePrice || rule.basePrice) * rule.linePriceMultiplier + rule.serviceSurcharge
    serviceFee = Math.min(base, rule.maxDeliveryFee)
    capDiscount = Math.max(base - serviceFee, 0)
    baseTitle = selectedLine.name ? `${selectedLine.name}线路价` : '线路价格'
    pricingNote = selectedLine.name ? `${draft.taskName || draft.service} · ${selectedLine.name}` : pricingNote
  } else {
    base = rule.basePrice + rule.serviceSurcharge
    const extraKm = Math.max(distance - rule.baseDistanceKm, 0)
    distanceFee = extraKm * rule.extraPerKm
    const subtotal = base + distanceFee
    const multiplier = pricingMode === 'distance_weather' && badWeather ? rule.badWeatherMultiplier : 1
    weatherFee = subtotal * (multiplier - 1)
    const uncappedServiceFee = subtotal + weatherFee
    serviceFee = Math.min(uncappedServiceFee, rule.maxDeliveryFee)
    capDiscount = Math.max(uncappedServiceFee - serviceFee, 0)
    baseTitle = rule.serviceSurcharge > 0 ? `${rule.baseDistanceKm}公里内（含服务费）` : `${rule.baseDistanceKm}公里内`
    if (pricingMode === 'distance_weather') {
      pricingNote = badWeather ? `天气预报触发恶劣天气 ×${rule.badWeatherMultiplier}` : `超出${rule.baseDistanceKm}公里按${rule.extraPerKm}元/公里，配送费封顶${rule.maxDeliveryFee}元`
    } else if (isManualQuote) {
      pricingNote = '系统预估价，仅供下单参考；商家报价后需再次确认'
    } else {
      pricingNote = `超出${rule.baseDistanceKm}公里按${rule.extraPerKm}元/公里，配送费封顶${rule.maxDeliveryFee}元`
    }
  }

  const deliveryFee = serviceFee
  const total = deliveryFee + productFee
  const totalText = `￥${formatMoney(total)}`
  return {
    distance: distance.toFixed(1),
    pricingMode,
    pricingNote,
    isManualQuote,
    baseTitle,
    base: formatMoney(base),
    baseText: `￥${formatMoney(base)}`,
    baseDistanceKm: rule.baseDistanceKm,
    extraPerKm: rule.extraPerKm,
    distanceFeeTitle,
    distanceFee: formatMoney(distanceFee),
    weatherFee: formatMoney(weatherFee),
    weightFee: '0.0',
    urgentFee: '0.0',
    vehicleFee: '0.0',
    discount: formatMoney(capDiscount),
    discountTitle: '同城配送封顶优惠',
    productFee: formatMoney(productFee),
    deliveryFee: formatMoney(deliveryFee),
    budget: formatMoney(productFee),
    serviceFee: formatMoney(serviceFee),
    total: formatMoney(total),
    totalText,
    showDistanceFee: distanceFee > 0,
    showWeatherFee: weatherFee > 0,
    showWeightFee: false,
    showVehicleFee: false,
    showUrgentFee: false,
    showDiscount: capDiscount > 0
  }
}

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  if (weight < 10) return `${weight}公斤`
  return `${weight}公斤以上`
}

function ensureDraftVehicle(draft) {
  if (!draft || draft.service === '帮买') return 'ebike'
  const target = draft.recommendedVehicleType || (draft.cargoOptions && draft.cargoOptions.vehicleId) || 'ebike'
  if (!draft.cargoOptions || draft.cargoOptions.vehicleId !== target || !draft.cargoOptions.icon) {
    vehicleConfig.applyVehicleToDraft(draft, target)
  }
  return draft.cargoOptions.vehicleId
}

function normalizeHandlingDraft(draft) {
  if (!draft || inferPricingMode(draft) !== 'manual_quote') return
  const selectedName = HANDLING_TYPES.some((item) => item.name === draft.item)
    ? draft.item
    : HANDLING_TYPES.some((item) => item.name === draft.service)
      ? draft.service
      : HANDLING_TYPES[0].name
  Object.assign(draft, serviceConfig.buildDraftService('moving_handling'))
  const handlingType = serviceConfig.applyHandlingType(draft, selectedName)
  vehicleConfig.applyVehicleToDraft(draft, handlingType.vehicleId)
}

function prepareFormState(draft) {
  const task = serviceConfig.getTask((draft && draft.taskId) || 'send_parcel')
  const taskLines = task.lines || []
  if (draft && taskLines.length && (!draft.selectedLine || !taskLines.some((item) => item.id === draft.selectedLine.id))) {
    draft.selectedLine = taskLines[0]
  }
  const fieldConfig = getFieldPreset(draft)
  if (draft && fieldConfig.itemTypes.length && !fieldConfig.itemTypes.includes(draft.item)) {
    draft.item = inferPricingMode(draft) === 'manual_quote' && fieldConfig.itemTypes.includes(draft.service)
      ? draft.service
      : fieldConfig.itemTypes[0]
  }
  return {
    taskLines,
    selectedLineId: draft && draft.selectedLine ? draft.selectedLine.id : '',
    fieldConfig,
    itemTypes: fieldConfig.itemTypes,
    handlingTypes: HANDLING_TYPES
  }
}

function generateLocalOrderId() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `S${Date.now()}${suffix}`
}

function buildLocalOrder(draft, estimate) {
  const isManualQuote = Boolean(estimate.isManualQuote)
  const fee = Number(estimate.total)
  return {
    id: generateLocalOrderId(),
    status: '待接单',
    statusIndex: 0,
    service: draft.service,
    pickupName: draft.pickup.name,
    pickupDetail: draft.pickup.detail,
    dropoffName: draft.dropoff.name,
    dropoffDetail: draft.dropoff.detail,
    item: draft.item,
    buyItems: draft.buyItems || '',
    productFee: Number(estimate.productFee || 0),
    deliveryFee: Number(estimate.deliveryFee || 0),
    budget: Number(estimate.productFee || 0),
    serviceFee: Number(estimate.deliveryFee || 0),
    purchaseAddressName: draft.purchaseAddress ? draft.purchaseAddress.name : draft.pickup.name,
    purchaseAddressDetail: draft.purchaseAddress ? draft.purchaseAddress.detail : draft.pickup.detail,
    vehicleName: draft.cargoOptions ? draft.cargoOptions.vehicleName : '二轮车',
    weightLabel: draft.service === '帮买' ? '' : (draft.cargoOptions ? draft.cargoOptions.weightLabel : getWeightLabel(Number(draft.weight || 1))),
    fee,
    estimatedFee: fee,
    feeText: isManualQuote ? `预估￥${fee}` : `￥${fee}`,
    pricingMode: estimate.pricingMode,
    isManualQuote,
    badWeather: !!draft.badWeather,
    weatherRisk: draft.weatherRisk || buildWeatherRisk(),
    quoteStatus: isManualQuote ? 'PENDING' : 'NONE',
    quotedFee: isManualQuote ? null : fee,
    quoteNote: '',
    distance: Number(estimate.distance),
    quoteStatusText: isManualQuote ? '等待商家报价' : '',
    needsQuote: isManualQuote,
    needsQuoteConfirmation: false,
    quoteAccepted: false,
    eta: isManualQuote ? '等待商家报价' : (draft.routeDuration ? `约 ${draft.routeDuration} 分钟` : '约 20 分钟'),
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
    productFee: Number(draft.budget || 0),
    budget: Number(draft.budget || 0),
    distanceKm: getRouteDistance(draft),
    weightKg: Number(draft.weight || 1),
    vehicleId: cargoOptions.vehicleId || 'ebike',
    vehicleName: cargoOptions.vehicleName || draft.recommendedVehicleName || '二轮车',
    cargoOptions,
    pricingMode: draft.pricingMode || inferPricingMode(draft),
    servicePricing: draft.servicePricing || {},
    selectedLine: draft.selectedLine || null,
    badWeather: !!draft.badWeather,
    weatherRisk: draft.weatherRisk || null,
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
    taskLines: [],
    selectedLineId: '',
    fieldConfig: FIELD_PRESETS.urgent_delivery,
    handlingTypes: HANDLING_TYPES,
    vehicles: vehicleConfig.VEHICLES,
    selectedVehicle: 'ebike',
    isVehicleSelectorOpen: false,
    guarantee: true,
    routeSource: '地址簿距离',
    routeDuration: '',
    isRouteLoading: false,
    isWeatherLoading: false,
    weatherRisk: buildWeatherRisk()
  },

  onShow() {
    const draft = app.globalData.draftOrder
    normalizeHandlingDraft(draft)
    const selectedVehicle = ensureDraftVehicle(draft)
    const formState = prepareFormState(draft)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      draft,
      estimate: estimateFee(draft),
      selectedVehicle,
      taskLines: formState.taskLines,
      selectedLineId: formState.selectedLineId,
      fieldConfig: formState.fieldConfig,
      itemTypes: formState.itemTypes,
      handlingTypes: formState.handlingTypes,
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || '',
      weatherRisk: draft.weatherRisk || buildWeatherRisk()
    })
    this.refreshRouteEstimate()
    this.refreshWeatherRisk()
  },

  refreshLocalEstimate() {
    const draft = app.globalData.draftOrder
    const formState = prepareFormState(draft)
    this.setData({
      draft,
      estimate: estimateFee(draft),
      selectedVehicle: (draft.cargoOptions && draft.cargoOptions.vehicleId) || this.data.selectedVehicle,
      taskLines: formState.taskLines,
      selectedLineId: formState.selectedLineId,
      fieldConfig: formState.fieldConfig,
      itemTypes: formState.itemTypes,
      handlingTypes: formState.handlingTypes,
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || '',
      weatherRisk: draft.weatherRisk || buildWeatherRisk()
    })
  },

  refreshWeatherRisk() {
    const draft = app.globalData.draftOrder
    if (inferPricingMode(draft) !== 'distance_weather') {
      draft.badWeather = false
      draft.weatherRisk = buildWeatherRisk('当前服务不使用天气加价')
      this.setData({
        draft,
        estimate: estimateFee(draft),
        weatherRisk: draft.weatherRisk,
        isWeatherLoading: false
      })
      return
    }

    if (!app.globalData.useBackend) {
      draft.badWeather = false
      draft.weatherRisk = buildWeatherRisk('本地演示按正常天气计价，真实环境由后端天气预报判断')
      this.setData({
        draft,
        estimate: estimateFee(draft),
        weatherRisk: draft.weatherRisk,
        isWeatherLoading: false
      })
      return
    }

    const weatherSeq = (this.weatherSeq || 0) + 1
    this.weatherSeq = weatherSeq
    this.setData({ isWeatherLoading: true })
    const point = getWeatherPoint(draft)
    api.getWeatherRisk({
      city: app.globalData.city || '宁德市',
      latitude: point.latitude,
      longitude: point.longitude
    }).then((risk) => {
      if (this.weatherSeq !== weatherSeq) return
      draft.badWeather = !!(risk && (risk.isBadWeather || risk.badWeather))
      draft.weatherRisk = risk || buildWeatherRisk()
      this.setData({
        draft,
        estimate: estimateFee(draft),
        weatherRisk: draft.weatherRisk,
        isWeatherLoading: false
      })
    }).catch(() => {
      if (this.weatherSeq !== weatherSeq) return
      draft.badWeather = false
      draft.weatherRisk = buildWeatherRisk('天气预报获取失败，按正常天气计价')
      this.setData({
        draft,
        estimate: estimateFee(draft),
        weatherRisk: draft.weatherRisk,
        isWeatherLoading: false
      })
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
        selectedLineId: draft.selectedLine ? draft.selectedLine.id : '',
        routeSource: route.source,
        routeDuration: route.duration,
        isRouteLoading: false
      })
    }).catch(() => {
      if (this.routeSeq === routeSeq) this.setData({ isRouteLoading: false })
    })
  },

  selectItem(event) {
    const item = event.currentTarget.dataset.item
    const draft = app.globalData.draftOrder
    const handlingType = inferPricingMode(draft) === 'manual_quote'
      ? HANDLING_TYPES.find((option) => option.name === item)
      : null
    if (handlingType) {
      serviceConfig.applyHandlingType(draft, handlingType.name)
      vehicleConfig.applyVehicleToDraft(draft, handlingType.vehicleId)
      this.setData({ isVehicleSelectorOpen: false })
    } else {
      draft.item = item
    }
    this.refreshLocalEstimate()
    this.refreshWeatherRisk()
  },

  selectLine(event) {
    const lineId = event.currentTarget.dataset.id
    const line = this.data.taskLines.find((item) => item.id === lineId)
    if (!line) return
    const draft = app.globalData.draftOrder
    draft.selectedLine = line
    vehicleConfig.applyVehicleToDraft(draft, draft.cargoOptions.vehicleId)
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
    this.setData({ isVehicleSelectorOpen: !this.data.isVehicleSelectorOpen })
  },

  selectVehicle(event) {
    const vehicleId = event.currentTarget.dataset.id
    const draft = app.globalData.draftOrder
    vehicleConfig.applyVehicleToDraft(draft, vehicleId)
    this.setData({
      draft,
      selectedVehicle: vehicleId,
      estimate: estimateFee(draft)
    })
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

  toggleBadWeather() {
    wx.showToast({ title: '恶劣天气由系统自动判断', icon: 'none' })
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
