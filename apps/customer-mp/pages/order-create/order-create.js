const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')
const serviceConfig = require('../../utils/service-config')
const vehicleConfig = require('../../utils/vehicle-config')
const navigation = require('../../utils/navigation')
const addressValidation = require('../../utils/address-validation')

const HANDLING_TYPES = serviceConfig.HANDLING_TYPES
const WEATHER_TASK_IDS = new Set(['urgent_delivery', 'pickup', 'buy_for_me'])

const FIELD_PRESETS = {
  send_parcel: {
    sectionTitle: '货物信息',
    sectionHint: '选择货物类型与重量',
    itemTypes: ['普通货物', '宠物'],
    showWeight: true,
    limitText: '价格按线路、物品和重量配置，当前待定',
    remarkPlaceholder: '备注：货物尺寸、件数、取件码、是否易碎'
  },
  carpool_ride: {
    sectionTitle: '乘车信息',
    sectionHint: '固定线路顺风车',
    itemTypes: [],
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
    sectionHint: '填写现场情况，工作人员按需求安排',
    itemTypes: ['搬运装卸'],
    showWeight: false,
    limitText: '',
    remarkPlaceholder: '请写清楼层、有无电梯、货物数量、是否需要多人'
  }
}

const DEFAULT_WEIGHT_OPTIONS = [1, 3, 5, 10, 15, 30]
const PARCEL_WEIGHT_OPTIONS = [10, 30]

function getFieldPreset(draft) {
  if (draft && ['manual_quote', 'handling_fixed'].includes(inferPricingMode(draft))) return FIELD_PRESETS.manual_quote
  return FIELD_PRESETS[(draft && draft.taskId) || ''] || FIELD_PRESETS.urgent_delivery
}

function getRouteOrigin(draft) {
  if (!draft) return null
  return draft.service === '帮买' ? (draft.purchaseAddress || draft.pickup) : draft.pickup
}

function getRouteDistance(draft) {
  if (draft && draft.taskId === 'moving_handling') return 0
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
  if (draft.service === '寄货' || draft.service === '寄货/配送') return 'parcel_category'
  if (draft.service === '拼车' || draft.service === '顺风车') return 'fixed_line_ride'
  if (draft.service === '搬运装卸' || draft.service === '装货' || draft.service === '卸货') return 'handling_fixed'
  if (draft.service === '急送' || draft.service === '帮取' || draft.service === '帮买' || draft.service === '帮送' || draft.service === '1对1急送') return 'distance_weather'
  return 'distance'
}

function getPricingRule(draft) {
  const vehicle = (draft && draft.cargoOptions) || {}
  const servicePricing = (draft && draft.servicePricing) || {}
  const hasServiceRule = Number(servicePricing.basePrice || 0) > 0
  const serviceBaseDistanceKm = Number(servicePricing.baseDistanceKm || 4)
  const serviceBasePrice = Number(servicePricing.basePrice || 0)
  const serviceExtraPerKm = Number(servicePricing.extraPerKm || 0)
  const weatherSurcharge = servicePricing.badWeatherSurcharge === undefined ? 5 : Number(servicePricing.badWeatherSurcharge)
  return {
    baseDistanceKm: hasServiceRule ? serviceBaseDistanceKm : 4,
    basePrice: hasServiceRule ? serviceBasePrice : Number(vehicle.baseFee || 10),
    extraPerKm: hasServiceRule ? serviceExtraPerKm : Number(vehicle.distanceRate || 1.6),
    badWeatherMultiplier: 1,
    badWeatherSurcharge: WEATHER_TASK_IDS.has(draft && draft.taskId) ? weatherSurcharge : 0,
    serviceSurcharge: 0,
    linePriceMultiplier: Number(vehicle.linePriceMultiplier || servicePricing.linePriceMultiplier || 1),
    maxDeliveryFee: 0
  }
}

function getParcelPriceFen(draft) {
  const routeId = draft && draft.selectedLine && draft.selectedLine.id
  const itemType = draft && draft.item === '宠物' ? 'PET' : 'NORMAL'
  const weightBand = itemType === 'PET' ? 'ANY' : Number(draft && draft.weight || 1) <= 10 ? 'UP_TO_10' : 'UP_TO_30'
  const entry = Array.isArray(draft && draft.parcelPricing)
    ? draft.parcelPricing.find((item) => item.routeId === routeId && item.itemType === itemType && item.weightBand === weightBand)
    : null
  if (!entry || entry.enabled === false) return 1
  return Math.max(1, Math.round(Number(entry.priceFen || 1)))
}

function applyRemotePricing(draft) {
  return serviceConfig.applyRemoteConfigToDraft(draft, app.globalData.appConfig || {})
}

function resetRouteSelectionState(draft) {
  draft.pickup = null
  draft.dropoff = null
  draft.quoteId = ''
  draft.routeDistanceKm = 0
  draft.routeDistanceSource = ''
  draft.routeDuration = ''
}

function estimateFee(draft) {
  const distance = getRouteDistance(draft)
  const isBuy = draft && draft.service === '帮买'
  const productFee = isBuy ? Number(draft.budget || 0) : 0
  const pricingMode = inferPricingMode(draft)
  const rule = getPricingRule(draft)
  const selectedLine = (draft && draft.selectedLine) || {}
  const linePrice = Number(selectedLine.price || 0)
  const hasSelectedLine = Boolean(selectedLine.id)
  const isFixedLine = pricingMode === 'fixed_line_parcel' || pricingMode === 'fixed_line_ride' || (hasSelectedLine && pricingMode !== 'parcel_category')
  const isManualQuote = pricingMode === 'manual_quote'
  const isHandlingFixed = pricingMode === 'handling_fixed'
  const badWeather = !!(draft && draft.badWeather)
  let base = 0
  let distanceFee = 0
  let weatherFee = 0
  let serviceFee = 0
  let capDiscount = 0
  let isPricePending = false
  let baseTitle = '起步价'
  let distanceFeeTitle = `超出${rule.baseDistanceKm}公里费用`
  let pricingNote = (draft && draft.priceSummary) || '按甲方规则计价'

  if (draft && (draft.taskId === 'send_parcel' || pricingMode === 'parcel_category')) {
    const isPet = draft.item === '宠物'
    const weight = Number(draft.weight || 1)
    const priceFen = getParcelPriceFen(draft)
    isPricePending = priceFen <= 1
    serviceFee = priceFen / 100
    base = serviceFee
    baseTitle = isPet ? '宠物配送费' : (weight <= 10 ? '普通货物（10kg内）' : '普通货物（30kg内）')
    pricingNote = isPricePending ? '当前线路、物品和重量的价格待定' : '商家已配置当前线路、物品和重量价格'
  } else if (isFixedLine) {
    const passengerCount = pricingMode === 'fixed_line_ride' || selectedLine.priceUnit === 'PER_PERSON' ? Number((draft && draft.passengerCount) || 1) : 1
    isPricePending = hasSelectedLine && linePrice <= 1
    base = (hasSelectedLine ? linePrice : rule.basePrice) * rule.linePriceMultiplier + rule.serviceSurcharge
    if (passengerCount > 1 || selectedLine.priceUnit === 'PER_PERSON') base *= passengerCount
    if (isPricePending) {
      base = 0.01
      serviceFee = 0.01
      pricingNote = '当前线路价格待定'
    }
    if (!isPricePending) serviceFee = base
    baseTitle = selectedLine.name ? `${selectedLine.name}线路价` : '线路价格'
    pricingNote = selectedLine.name ? `${draft.taskName || draft.service} · ${selectedLine.name}` : pricingNote
  } else if (isHandlingFixed) {
    base = Number(draft && draft.servicePricing && draft.servicePricing.basePrice || 48)
    serviceFee = base
    baseTitle = '固定上门搬运费'
    pricingNote = '仅收固定人工服务费；如需运输请使用运货'
  } else {
    base = rule.basePrice
    const extraKm = Math.ceil(Math.max(distance - rule.baseDistanceKm, 0))
    distanceFee = extraKm * rule.extraPerKm
    const subtotal = base + distanceFee
    const isTwoWheelWeatherTask = WEATHER_TASK_IDS.has(draft && draft.taskId) && (draft.cargoOptions && draft.cargoOptions.vehicleId === 'ebike')
    weatherFee = isTwoWheelWeatherTask && badWeather
      ? rule.badWeatherSurcharge
      : 0
    serviceFee = subtotal + weatherFee
    baseTitle = `${rule.baseDistanceKm}公里内`
    if (isTwoWheelWeatherTask) {
      pricingNote = badWeather ? `恶劣天气每单加${rule.badWeatherSurcharge}元` : `超出${rule.baseDistanceKm}公里按${rule.extraPerKm}元/公里`
    } else if (isManualQuote) {
      pricingNote = '系统预估价，仅供下单参考；商家报价后需再次确认'
    } else {
      pricingNote = `超出${rule.baseDistanceKm}公里按${rule.extraPerKm}元/公里`
    }
  }

  const deliveryFee = serviceFee
  const total = deliveryFee + productFee
  const totalText = isPricePending ? '待定' : `￥${formatMoney(total)}`
  const outputPricingMode = isFixedLine ? 'fixed_route' : pricingMode
  return {
    distance: distance.toFixed(1),
    pricingMode: outputPricingMode,
    pricingNote,
    isPricePending,
    isManualQuote,
    baseTitle,
    base: formatMoney(base),
    baseText: isPricePending ? '待定' : `￥${formatMoney(base)}`,
    baseDistanceKm: rule.baseDistanceKm,
    extraPerKm: rule.extraPerKm,
    distanceFeeTitle,
    distanceFee: formatMoney(distanceFee),
    weatherFee: formatMoney(weatherFee),
    weightFee: '0.0',
    urgentFee: '0.0',
    vehicleFee: '0.0',
    discount: formatMoney(capDiscount),
    discountTitle: '',
    productFee: formatMoney(productFee),
    deliveryFee: formatMoney(deliveryFee),
    budget: formatMoney(productFee),
    serviceFee: formatMoney(serviceFee),
    total: formatMoney(total),
    totalText,
    showDistanceFee: distanceFee > 0,
    showWeatherFee: weatherFee > 0,
    weatherEnabled: WEATHER_TASK_IDS.has(draft && draft.taskId),
    showWeightFee: false,
    showVehicleFee: false,
    showUrgentFee: false,
    showDiscount: false
  }
}

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  if (weight < 10) return `${weight}公斤`
  return `${weight}公斤以上`
}

function getWeightOptions(draft) {
  return draft && draft.taskId === 'send_parcel' ? PARCEL_WEIGHT_OPTIONS : DEFAULT_WEIGHT_OPTIONS
}

function getParcelWeightLabel(weight) {
  return Number(weight) > 10 ? '30kg内' : '10kg内'
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
  if (!draft || inferPricingMode(draft) !== 'handling_fixed') return
  const selectedName = HANDLING_TYPES.some((item) => item.name === draft.item)
    ? draft.item
    : HANDLING_TYPES.some((item) => item.name === draft.service)
      ? draft.service
      : HANDLING_TYPES[0].name
  const normalizedName = selectedName === '叉车' ? HANDLING_TYPES[0].name : selectedName
  Object.assign(draft, serviceConfig.buildDraftService('moving_handling'))
  const handlingType = serviceConfig.applyHandlingType(draft, normalizedName)
  draft.pricingMode = 'handling_fixed'
  draft.requiresDelivery = false
  draft.budget = 0
  draft.buyItems = ''
  draft.purchaseAddress = null
  draft.buyCategoryId = ''
  draft.buyCategoryName = ''
  draft.dropoff = null
  vehicleConfig.applyVehicleToDraft(draft, handlingType.vehicleId)
}

function prepareFormState(draft) {
  const task = serviceConfig.getTask((draft && draft.taskId) || 'send_parcel')
  const remoteRoutesConfigured = Boolean(draft && draft.servicePricing && draft.servicePricing.remote)
  const taskLines = remoteRoutesConfigured ? ((draft && draft.remoteTaskLines) || []) : ((draft && draft.remoteTaskLines && draft.remoteTaskLines.length ? draft.remoteTaskLines : task.lines) || [])
  if (draft && taskLines.length && !serviceConfig.isRouteTask(draft.taskId) && (!draft.selectedLine || !taskLines.some((item) => item.id === draft.selectedLine.id))) {
    draft.selectedLine = taskLines[0]
  }
  const fieldConfig = getFieldPreset(draft)
  if (draft && fieldConfig.itemTypes.length && !fieldConfig.itemTypes.includes(draft.item)) {
    draft.item = inferPricingMode(draft) === 'manual_quote' && fieldConfig.itemTypes.includes(draft.service)
      ? draft.service
      : fieldConfig.itemTypes[0]
  }
  const weightOptions = getWeightOptions(draft)
  const rawWeight = Number((draft && draft.weight) || weightOptions[0] || 1)
  const selectedWeight = task.id === 'send_parcel' ? (rawWeight > 10 ? 30 : 10) : rawWeight
  if (draft && task.id === 'send_parcel') {
    draft.weight = selectedWeight
    draft.weightLabel = draft.item === '宠物' ? '' : getParcelWeightLabel(selectedWeight)
    if (draft.cargoOptions) {
      draft.cargoOptions.weight = selectedWeight
      draft.cargoOptions.weightLabel = draft.weightLabel
    }
  }
  return {
    taskLines,
    requiresLine: serviceConfig.isRouteTask(task && task.id),
    addressLocked: serviceConfig.isRouteTask(task && task.id) && !(draft && draft.selectedLine),
    selectedLineId: draft && draft.selectedLine ? draft.selectedLine.id : '',
    fieldConfig,
    itemTypes: fieldConfig.itemTypes,
    weights: weightOptions,
    handlingTypes: HANDLING_TYPES,
    selectedItem: (draft && draft.item) || '',
    selectedWeight
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
    dropoffName: draft.dropoff ? draft.dropoff.name : '',
    dropoffDetail: draft.dropoff ? draft.dropoff.detail : '',
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
  const isBuyForMe = draft.taskId === 'buy_for_me' || draft.service === '帮买'
  const productFee = isBuyForMe ? Number(draft.budget || 0) : 0
  return {
    userId: app.globalData.userId,
    service: draft.service,
    taskId: draft.taskId,
    quoteId: draft.quoteId || '',
    routeId: draft.selectedLine ? draft.selectedLine.id : '',
    direction: draft.direction || 'OUTBOUND',
    passengerCount: Number(draft.passengerCount || 1),
    requiresDelivery: draft.taskId === 'moving_handling' ? false : Boolean(draft.requiresDelivery),
    item: draft.item,
    pickupAddressId: draft.pickup.id,
    dropoffAddressId: draft.dropoff ? draft.dropoff.id : '',
    pickup: draft.pickup,
    dropoff: draft.dropoff,
    purchaseAddressId: purchaseAddress ? purchaseAddress.id : '',
    purchase: purchaseAddress,
    buyItems: draft.buyItems || '',
    productFee,
    budget: productFee,
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

function requestBackendQuote(draft) {
  const pickup = draft.pickup || {}
  const dropoff = draft.dropoff || null
  const point = (address) => address ? {
    name: address.name || '',
    detail: address.detail || '',
    city: address.city || '',
    district: address.district || '',
    adcode: String(address.adcode || ''),
    latitude: Number(address.latitude || (address.location && address.location.latitude) || 0),
    longitude: Number(address.longitude || (address.location && address.location.longitude) || 0)
  } : undefined
  const productFee = draft.taskId === 'buy_for_me' || draft.service === '帮买'
    ? Number(draft.budget || 0)
    : 0
  return api.quoteOrder({
    taskId: draft.taskId,
    routeId: draft.selectedLine ? draft.selectedLine.id : '',
    direction: draft.direction || 'OUTBOUND',
    passengerCount: Number(draft.passengerCount || 1),
    requiresDelivery: draft.taskId === 'moving_handling' ? false : Boolean(draft.requiresDelivery),
    item: draft.item || '',
    pickup: point(pickup),
    dropoff: point(dropoff),
    weightKg: Math.round(Number(draft.weight || 1)),
    productFeeFen: Math.round(productFee * 100)
  })
}

function confirmServerQuote(quote, displayedTotal) {
  if (!quote) return Promise.resolve(null)
  const serverTotal = Number(quote.totalFen || 0) / 100
  if (Math.abs(serverTotal - Number(displayedTotal || 0)) < 0.001) return Promise.resolve(quote)
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '价格已更新',
      content: `最新后端报价为￥${serverTotal.toFixed(2)}，是否按新价格继续？`,
      confirmText: '继续下单',
      success(result) {
        if (result.confirm) resolve(quote)
        else reject(Object.assign(new Error('用户取消价格变更'), { cancelled: true }))
      },
      fail: reject
    })
  })
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
    itemTypes: ['普通货物', '宠物'],
    weights: DEFAULT_WEIGHT_OPTIONS,
    taskLines: [],
    requiresLine: false,
    addressLocked: false,
    selectedLineId: '',
    fieldConfig: FIELD_PRESETS.urgent_delivery,
    handlingTypes: HANDLING_TYPES,
    selectedItem: '',
    selectedWeight: 10,
    vehicles: vehicleConfig.VEHICLES,
    selectedVehicle: 'ebike',
    isVehicleSelectorOpen: false,
    routeSource: '地址簿距离',
    routeDuration: '',
    isRouteLoading: false,
    isWeatherLoading: false,
    isSubmitting: false,
    pricingReady: false,
    passengerCount: 1,
    weatherRisk: buildWeatherRisk()
  },

  onShow() {
    const draft = app.globalData.draftOrder
    const backendPricing = Boolean(app.globalData.useBackend)
    normalizeHandlingDraft(draft)
    applyRemotePricing(draft)
    const selectedVehicle = ensureDraftVehicle(draft)
    const formState = prepareFormState(draft)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      draft,
      estimate: estimateFee(draft),
      selectedVehicle,
      taskLines: formState.taskLines,
      requiresLine: formState.requiresLine,
      addressLocked: formState.addressLocked,
      selectedLineId: formState.selectedLineId,
      fieldConfig: formState.fieldConfig,
      itemTypes: formState.itemTypes,
      weights: formState.weights,
      handlingTypes: formState.handlingTypes,
      selectedItem: formState.selectedItem,
      selectedWeight: formState.selectedWeight,
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || '',
      weatherRisk: draft.weatherRisk || buildWeatherRisk(),
      passengerCount: Number(draft.passengerCount || 1),
      pricingReady: !backendPricing
    })
    navigation.afterVisible(() => {
      const sync = app.globalData.useBackend && app.refreshAppConfig
        ? this.syncRemotePricing()
        : Promise.resolve()
      sync.then(() => Promise.all([
        this.refreshRouteEstimate(),
        this.refreshWeatherRisk(),
        this.refreshRouteOptions()
      ])).finally(() => this.setData({ pricingReady: true }))
    })
    if (this.pricingSyncTimer) clearInterval(this.pricingSyncTimer)
    if (app.globalData.useBackend && app.refreshAppConfig) this.pricingSyncTimer = setInterval(() => this.syncRemotePricing(true), 30000)
  },

  onHide() {
    if (this.pricingSyncTimer) {
      clearInterval(this.pricingSyncTimer)
      this.pricingSyncTimer = null
    }
  },

  syncRemotePricing(showNotice) {
    const previousVersion = Number(app.globalData.pricingVersion || 0)
    return app.refreshAppConfig().then((config) => {
      const draft = app.globalData.draftOrder
      const changed = applyRemotePricing(draft)
      if (changed) this.refreshLocalEstimate()
      const nextVersion = Number((config && (config.pricingVersion || (config.pricing && config.pricing.version))) || app.globalData.pricingVersion || 0)
      if (showNotice && previousVersion && nextVersion !== previousVersion) wx.showToast({ title: '价格规则已更新', icon: 'none' })
      return config
    })
  },

  refreshRouteOptions() {
    const draft = app.globalData.draftOrder
    if (!app.globalData.useBackend || !serviceConfig.isRouteTask(draft.taskId)) return Promise.resolve()
    const remoteService = (app.globalData.appConfig && app.globalData.appConfig.services || []).find((item) => item.id === draft.taskId)
    if (remoteService && Array.isArray(remoteService.routes)) {
      applyRemotePricing(draft)
      this.refreshLocalEstimate()
      return Promise.resolve()
    }
    if (draft.taskId !== 'carpool_ride') return Promise.resolve()
    return api.getCarpoolRoutes().then((routes) => {
      const taskLines = routes.map((route) => ({ id: route.id, name: route.city, price: Number(route.unitPriceFen || 0) / 100, priceUnit: 'PER_PERSON', pending: Number(route.unitPriceFen || 0) <= 1 }))
      const selected = taskLines.find((line) => draft.selectedLine && line.id === draft.selectedLine.id) || null
      draft.selectedLine = selected
      const formState = prepareFormState(draft)
      this.setData({
        taskLines: formState.taskLines,
        requiresLine: formState.requiresLine,
        addressLocked: formState.addressLocked,
        selectedLineId: formState.selectedLineId
      })
      this.refreshLocalEstimate()
    }).catch(() => wx.showToast({ title: '线路价格同步失败，请稍后重试', icon: 'none' }))
  },

  refreshLocalEstimate() {
    const draft = app.globalData.draftOrder
    const formState = prepareFormState(draft)
    this.setData({
      draft,
      estimate: estimateFee(draft),
      selectedVehicle: (draft.cargoOptions && draft.cargoOptions.vehicleId) || this.data.selectedVehicle,
      taskLines: formState.taskLines,
      requiresLine: formState.requiresLine,
      addressLocked: formState.addressLocked,
      selectedLineId: formState.selectedLineId,
      fieldConfig: formState.fieldConfig,
      itemTypes: formState.itemTypes,
      handlingTypes: formState.handlingTypes,
      selectedItem: formState.selectedItem,
      selectedWeight: formState.selectedWeight,
      routeSource: getRouteSource(draft),
      routeDuration: draft.routeDuration || '',
      weatherRisk: draft.weatherRisk || buildWeatherRisk(),
      passengerCount: Number(draft.passengerCount || 1)
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
      return Promise.resolve()
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
      return Promise.resolve()
    }

    const weatherSeq = (this.weatherSeq || 0) + 1
    this.weatherSeq = weatherSeq
    this.setData({ isWeatherLoading: true })
    const point = getWeatherPoint(draft)
    return api.getWeatherRisk({
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
    if (!draft.dropoff) return Promise.resolve()
    const origin = getRouteOrigin(draft)
    if (!origin) return Promise.resolve()
    const routeSeq = (this.routeSeq || 0) + 1
    this.routeSeq = routeSeq
    this.setData({ isRouteLoading: true })
    return map.estimateDistance(origin, draft.dropoff).then((route) => {
      if (this.routeSeq !== routeSeq) return
      draft.routeDistanceKm = route.distanceKm
      draft.routeDistanceSource = route.source
      draft.routeDuration = route.duration
      this.setData({
        draft,
        estimate: estimateFee(draft),
        addressLocked: serviceConfig.isRouteTask(draft.taskId) && !draft.selectedLine,
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
    const handlingType = inferPricingMode(draft) === 'handling_fixed'
      ? HANDLING_TYPES.find((option) => option.name === item)
      : null
    if (handlingType) {
      if (handlingType.phone) {
        wx.makePhoneCall({ phoneNumber: handlingType.phone })
        return
      }
      serviceConfig.applyHandlingType(draft, handlingType.name)
      draft.pricingMode = 'handling_fixed'
      draft.requiresDelivery = false
      draft.dropoff = null
      vehicleConfig.applyVehicleToDraft(draft, handlingType.vehicleId)
      this.setData({ selectedItem: handlingType.name, 'draft.item': handlingType.name, isVehicleSelectorOpen: false })
    } else {
      draft.item = item
      const updates = { selectedItem: item, 'draft.item': item }
      if (draft.taskId === 'send_parcel') {
        draft.weightLabel = item === '宠物' ? '' : getParcelWeightLabel(Number(draft.weight || 10))
        if (draft.cargoOptions) draft.cargoOptions.weightLabel = draft.weightLabel
        updates['draft.weightLabel'] = draft.weightLabel
        updates['draft.cargoOptions.weightLabel'] = draft.weightLabel
      }
      this.setData(updates)
    }
    this.refreshLocalEstimate()
    this.refreshWeatherRisk()
  },

  callHandlingPhone(event) {
    const phone = String(event.currentTarget.dataset.phone || '').trim()
    if (phone) wx.makePhoneCall({ phoneNumber: phone })
  },

  selectLine(event) {
    const draft = app.globalData.draftOrder
    const lineId = event.currentTarget.dataset.id
    const line = this.data.taskLines.find((item) => item.id === lineId)
    if (!line) return
    draft.selectedLine = line
    resetRouteSelectionState(draft)
    if (draft.taskId === 'carpool_ride') carpool.applyRoute(draft, { routeId: line.id, clearAddress: true })
    vehicleConfig.applyVehicleToDraft(draft, draft.cargoOptions.vehicleId)
    this.refreshLocalEstimate()
    this.refreshRouteEstimate()
  },

  selectWeight(event) {
    const weight = Number(event.currentTarget.dataset.weight)
    app.globalData.draftOrder.weight = weight
    if (app.globalData.draftOrder.cargoOptions) {
      app.globalData.draftOrder.cargoOptions.weight = weight
      app.globalData.draftOrder.cargoOptions.weightLabel = app.globalData.draftOrder.item === '宠物'
        ? ''
        : (app.globalData.draftOrder.taskId === 'send_parcel' ? getParcelWeightLabel(weight) : getWeightLabel(weight))
    }
    app.globalData.draftOrder.weightLabel = app.globalData.draftOrder.item === '宠物'
      ? ''
      : (app.globalData.draftOrder.taskId === 'send_parcel' ? getParcelWeightLabel(weight) : getWeightLabel(weight))
    this.setData({
      selectedWeight: weight,
      'draft.weight': weight,
      'draft.weightLabel': app.globalData.draftOrder.weightLabel,
      'draft.cargoOptions.weight': weight,
      'draft.cargoOptions.weightLabel': app.globalData.draftOrder.cargoOptions
        ? app.globalData.draftOrder.cargoOptions.weightLabel
        : ''
    })
    this.refreshLocalEstimate()
  },

  openCargoOptions() {
    wx.showToast({ title: '当前业务车型已固定', icon: 'none' })
  },

  selectVehicle(event) {
    wx.showToast({ title: '当前业务车型已固定', icon: 'none' })
  },

  selectDirection(event) {
    const draft = app.globalData.draftOrder
    const previousAddress = draft.selectedLine ? carpool.getCitySideAddress(draft) : null
    draft.direction = event.currentTarget.dataset.direction
    if (draft.selectedLine) {
      carpool.applyRoute(draft, { address: previousAddress })
    }
    this.refreshLocalEstimate()
  },

  changePassenger(event) {
    const draft = app.globalData.draftOrder
    const next = Math.max(1, Math.min(6, Number(draft.passengerCount || 1) + Number(event.currentTarget.dataset.step || 0)))
    draft.passengerCount = next
    draft.item = `${next}人`
    this.setData({ passengerCount: next })
    this.refreshLocalEstimate()
  },

  chooseRouteAddress(event) {
    const draft = app.globalData.draftOrder
    const type = event.currentTarget.dataset.type
    if (serviceConfig.isRouteTask(draft.taskId) && !draft.selectedLine) {
      wx.showToast({ title: '请先选择线路', icon: 'none' })
      return
    }
    const routeId = draft.selectedLine && draft.selectedLine.id
    const mode = draft.taskId === 'carpool_ride' ? `&mode=carpool&route=${routeId}` : ''
    navigation.navigateTo(wx, { url: `/pages/address/address?type=${type}${mode}` })
  },

  promptSelectLine() {
    wx.showToast({ title: '请先选择线路', icon: 'none' })
  },

  toggleHandlingDelivery() {
    const draft = app.globalData.draftOrder
    draft.requiresDelivery = false
    draft.dropoff = null
    wx.showToast({ title: '搬运装卸仅提供上门服务', icon: 'none' })
  },

  chooseHandlingDestination() {
    wx.showToast({ title: '搬运装卸仅提供上门服务', icon: 'none' })
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

  toggleBadWeather() {
    wx.showToast({ title: '恶劣天气由系统自动判断', icon: 'none' })
  },

  submitOrder() {
    const draft = app.globalData.draftOrder
    const contactError = (address, label) => {
      const validation = addressValidation.validateAddress(address)
      return validation.valid ? '' : `${label}地址${validation.message}，请返回补充`
    }
    if (serviceConfig.isRouteTask(draft.taskId) && !draft.selectedLine) {
      wx.showToast({ title: '请先选择线路', icon: 'none' })
      return
    }
    if (draft.taskId === 'carpool_ride') {
      const validation = carpool.validateDraft(draft)
      if (!validation.valid) {
        wx.showToast({ title: validation.message, icon: 'none' })
        return
      }
    }
    if (!draft.pickup) {
      wx.showToast({ title: '请先选择发货地址', icon: 'none' })
      return
    }
    if (draft.taskId === 'moving_handling') {
      draft.requiresDelivery = false
      draft.dropoff = null
    }
    if (draft.taskId !== 'moving_handling' && !draft.dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }
    const pickupContactError = draft.taskId === 'carpool_ride' && draft.pickup && draft.pickup.isCarpoolFixedStop
      ? ''
      : contactError(draft.pickup, '发货')
    const dropoffContactError = draft.dropoff ? contactError(draft.dropoff, '目的地') : ''
    if (pickupContactError || dropoffContactError) {
      wx.showToast({ title: pickupContactError || dropoffContactError, icon: 'none', duration: 2600 })
      return
    }
    if (draft.service === '帮买' && !String(draft.buyItems || '').trim()) {
      wx.showToast({ title: '请填写想买的商品', icon: 'none' })
      return
    }
    if (app.globalData.useBackend && (!app.globalData.isLoggedIn || !app.globalData.authToken)) {
      wx.showToast({ title: '请先登录后下单', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), 500)
      return
    }
    if (app.globalData.useBackend && !this.data.pricingReady) {
      wx.showToast({ title: '正在同步最新价格，请稍候', icon: 'none' })
      return
    }
    if (this.data.isSubmitting) return
    this.setData({ isSubmitting: true })

    const estimate = estimateFee(draft)
    if (estimate.isPricePending) {
      this.setData({ isSubmitting: false })
      wx.showToast({ title: '当前线路、物品和重量价格待定，请先让商家配置', icon: 'none', duration: 2600 })
      return
    }
    const submitLocal = (toastTitle) => {
      const order = buildLocalOrder(draft, estimate)
      cacheOrder(order)
      wx.showToast({ title: toastTitle || '下单成功', icon: 'success' })
      setTimeout(() => {
        navigation.redirectTo(wx, { url: `/pages/order-detail/order-detail?id=${order.id}` })
      }, 450)
    }

    if (!app.globalData.useBackend) {
      submitLocal('下单成功')
      this.setData({ isSubmitting: false })
      return
    }

    requestBackendQuote(draft).then((quote) => confirmServerQuote(quote, estimate.total)).then((quote) => {
      if (quote) draft.quoteId = quote.id
      return api.createOrder(buildBackendPayload(draft))
    }).then((order) => {
      cacheOrder(order)
      if (order.isManualQuote) {
        wx.showToast({ title: '下单成功，等待商家报价', icon: 'success' })
        return order
      }
      return api.createWechatPayment(order.id).then(api.requestWechatPayment).then(() => {
        wx.showToast({ title: '下单成功', icon: 'success' })
        return order
      }).catch((error) => {
        wx.showToast({ title: error.errMsg || error.message || '订单已创建，请稍后支付', icon: 'none' })
        return order
      })
    }).then((order) => {
      if (!order) return
      setTimeout(() => navigation.redirectTo(wx, { url: `/pages/order-detail/order-detail?id=${order.id}` }), 450)
    }).catch((error) => {
      if (error && error.cancelled) return
      wx.showToast({ title: error.message || '下单失败', icon: 'none' })
    }).finally(() => {
      this.setData({ isSubmitting: false })
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
