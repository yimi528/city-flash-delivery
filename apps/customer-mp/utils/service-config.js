const PRIMARY_TASKS = [
  {
    id: 'send_parcel',
    name: '寄货/配送',
    icon: '📦',
    subtitle: '普通货物 · 宠物',
    desc: '价格按线路、物品和重量配置，当前待定',
    vehicleType: 'small_car',
    vehicleName: '小车',
    priceSummary: '价格按线路、物品和重量配置，当前待定',
    pricingMode: 'parcel_category',
    parcelPricing: [],
    serviceSurcharge: 0,
    lines: [
      { id: 'wenzhou_parcel', name: '温州', price: 0, priceUnit: 'PER_ORDER', pending: true },
      { id: 'cangnan_parcel', name: '苍南', price: 0, priceUnit: 'PER_ORDER', pending: true },
      { id: 'qinyu_parcel', name: '秦屿', price: 0, priceUnit: 'PER_ORDER', pending: true },
      { id: 'longan_parcel', name: '龙安', price: 0, priceUnit: 'PER_ORDER', pending: true }
    ],
    limits: { maxWeightKg: 30, maxVolumeM3: 1 }
  },
  {
    id: 'carpool_ride',
    name: '顺风车',
    icon: '🚘',
    subtitle: '固定线路顺风车',
    desc: '固定线路顺风车',
    vehicleType: 'business_van',
    vehicleName: '小车',
    priceSummary: '往返线路及价格由商家端配置',
    pricingMode: 'fixed_line_ride',
    serviceSurcharge: 0,
    lines: [
      { id: 'cangnan', name: '苍南', price: 40 },
      { id: 'wenzhou', name: '温州', price: 150 },
      { id: 'fuzhou', name: '福州', price: 0 }
    ]
  },
  {
    id: 'cargo_haul',
    name: '运货',
    icon: '🚚',
    subtitle: '货三轮车',
    desc: '市场拉货、商家补货',
    vehicleType: 'cargo_tricycle',
    vehicleName: '货三轮车',
    priceSummary: '货三轮4公里内33元，超出3元/公里',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 33,
    extraPerKm: 3,
    serviceSurcharge: 0
  },
  {
    id: 'urgent_delivery',
    name: '急送',
    icon: '⚡',
    subtitle: '二轮急送',
    desc: '一对一快速送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '二轮车4公里内13元，超出1.6元/公里；恶劣天气每单加5元',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 13,
    extraPerKm: 1.6,
    badWeatherMultiplier: 1,
    badWeatherSurcharge: 5,
    serviceSurcharge: 0
  }
]

const HANDLING_TYPES = [
  {
    name: '搬运装卸',
    icon: '🏗️',
    desc: '搬家、搬店、装货、卸货等人工服务',
    vehicleId: 'manual_labor',
    vehicleName: '人力服务',
    serviceSurcharge: 0,
    priceSummary: '搬运装卸固定48元；填写上门服务地址'
  },
  {
    name: '叉车',
    icon: '🚜',
    desc: '叉车作业仅支持电话预约',
    phone: '18705939528',
    vehicleId: 'forklift_service',
    vehicleName: '叉车服务',
    serviceSurcharge: 0,
    priceSummary: '叉车服务请致电 18705939528'
  }
]

const COMMON_TASKS = [
  {
    id: 'pickup',
    icon: '📥',
    name: '帮取',
    subtitle: '二轮车',
    desc: '帮你取件再送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '二轮车4公里内10元，超出1.6元/公里',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.6,
    badWeatherMultiplier: 1,
    badWeatherSurcharge: 5,
    serviceSurcharge: 0
  },
  {
    id: 'buy_for_me',
    icon: '🛍️',
    name: '帮买',
    subtitle: '二轮车',
    desc: '帮买商品并送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '商品价格另加配送费，二轮车12元起；恶劣天气每单加5元',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 12,
    extraPerKm: 1.6,
    badWeatherMultiplier: 1,
    badWeatherSurcharge: 5,
    serviceSurcharge: 0
  },
  {
    id: 'moving_handling',
    icon: '🏗️',
    name: '搬运装卸',
    subtitle: '搬家 · 搬店 · 装卸',
    desc: '统一提交搬运需求',
    vehicleType: 'manual_labor',
    vehicleName: '人力服务',
    priceSummary: '搬运装卸固定48元；填写上门服务地址',
    pricingMode: 'handling_fixed',
    baseDistanceKm: 0,
    basePrice: 48,
    extraPerKm: 0,
    serviceSurcharge: 0
  },
  {
    id: 'pedicab_delivery',
    icon: '🛺',
    name: '送货/送客',
    subtitle: '人力三轮车',
    desc: '短途送货或送客',
    vehicleType: 'human_tricycle',
    vehicleName: '人力三轮车',
    priceSummary: '人力三轮4公里内15元，超出2元/公里',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 15,
    extraPerKm: 2,
    serviceSurcharge: 0
  }
]

const TASKS_BY_ID = PRIMARY_TASKS.concat(COMMON_TASKS).reduce((result, task) => {
  result[task.id] = task
  return result
}, {})

const ALL_TASKS = [
  'send_parcel',
  'carpool_ride',
  'cargo_haul',
  'moving_handling',
  'urgent_delivery',
  'pickup',
  'buy_for_me',
  'pedicab_delivery'
].map((id) => TASKS_BY_ID[id])

const ROUTE_TASK_IDS = ['carpool_ride', 'send_parcel']

function isRouteTask(taskId) {
  return ROUTE_TASK_IDS.includes(taskId)
}

const DEFAULT_ITEMS = {
  send_parcel: '普通货物',
  carpool_ride: '1人',
  cargo_haul: '门店补货',
  urgent_delivery: '文件/小件',
  pickup: '快递包裹',
  buy_for_me: '万能帮买',
  moving_handling: '搬运装卸',
  pedicab_delivery: '短途送客'
}

function normalizeTaskId(id) {
  if (id === 'moving' || id === 'move_shop' || id === 'load_goods' || id === 'unload_goods') return 'moving_handling'
  return id
}

function getTask(id) {
  const normalizedId = normalizeTaskId(id)
  return ALL_TASKS.find((item) => item.id === normalizedId) || PRIMARY_TASKS[0]
}

function getDefaultItem(taskId) {
  const task = getTask(normalizeTaskId(taskId))
  return DEFAULT_ITEMS[task.id] || task.name
}

function applyHandlingType(draft, itemName) {
  const requestedType = HANDLING_TYPES.find((item) => item.name === itemName) || HANDLING_TYPES[0]
  const handlingType = requestedType.phone ? HANDLING_TYPES[0] : requestedType
  draft.item = handlingType.name
  draft.recommendedVehicleType = handlingType.vehicleId
  draft.recommendedVehicleName = handlingType.vehicleName
  draft.priceSummary = handlingType.priceSummary
  draft.servicePricing = {
    baseDistanceKm: 0,
    basePrice: 48,
    extraPerKm: 0,
    badWeatherMultiplier: 1,
    badWeatherSurcharge: 0,
    serviceSurcharge: 0
  }
  return handlingType
}

function buildDraftService(taskId) {
  const task = getTask(taskId)
  return {
    taskId: task.id,
    taskName: task.name,
    serviceGroupId: task.vehicleType,
    serviceGroupName: task.vehicleName,
    serviceId: task.id,
    service: task.name,
    subServiceId: task.id,
    subServiceName: task.name,
    serviceDesc: task.desc,
    priceSummary: task.priceSummary,
    pricingMode: task.pricingMode,
    recommendedVehicleType: task.vehicleType,
    recommendedVehicleName: task.vehicleName,
    selectedLine: isRouteTask(task.id) ? null : (task.lines ? task.lines[0] : null),
    remoteTaskLines: [],
    parcelPricing: task.parcelPricing || [],
    serviceLimits: task.limits || null,
    badWeather: false,
    servicePricing: {
      baseDistanceKm: task.baseDistanceKm || 0,
      basePrice: task.basePrice || 0,
      extraPerKm: task.extraPerKm || 0,
      badWeatherMultiplier: task.badWeatherMultiplier || 1,
      badWeatherSurcharge: task.badWeatherSurcharge || 0,
      serviceSurcharge: task.serviceSurcharge || 0
    }
  }
}

function applyRemoteConfigToDraft(draft, config) {
  if (!draft || !config) return false
  const remoteService = (config.services || []).find((item) => item.id === draft.taskId)
  const remoteRule = (config.pricing && config.pricing.rules || []).find((item) => item.serviceId === draft.taskId)
  if (!remoteService && !remoteRule) return false

  if (remoteService) {
    if (remoteService.priceSummary) draft.priceSummary = remoteService.priceSummary
    if (remoteService.vehicleName) draft.recommendedVehicleName = remoteService.vehicleName
  }
  if (!remoteRule) return true

  const weatherEnabled = ['urgent_delivery', 'pickup', 'buy_for_me'].includes(draft.taskId)
  const basePrice = (Number(remoteRule.baseFeeFen || 0) + Number(remoteRule.serviceSurchargeFen || 0)) / 100
  const extraPerKm = Number(remoteRule.perKmFen || 0) / 100
  const maxDeliveryFee = 0
  draft.pricingMode = remoteRule.pricingMode || draft.pricingMode
  if (draft.taskId === 'send_parcel') draft.parcelPricing = Array.isArray(remoteRule.parcelPricing) ? remoteRule.parcelPricing : []
  draft.pricingVersion = Number(config.pricingVersion || (config.pricing && config.pricing.version) || 0)
  draft.servicePricing = Object.assign({}, draft.servicePricing || {}, {
    remote: true,
    baseDistanceKm: draft.taskId === 'moving_handling' ? 0 : Number(remoteRule.includedDistanceMeters || 0) / 1000,
    basePrice,
    extraPerKm: draft.taskId === 'moving_handling' ? 0 : extraPerKm,
    serviceSurcharge: 0,
    deliveryStartFee: 0,
    minimumFee: 0,
    maxDeliveryFee,
    badWeatherMultiplier: 1,
    badWeatherSurcharge: weatherEnabled ? (remoteRule.weatherSurchargeFen === undefined ? 5 : Number(remoteRule.weatherSurchargeFen || 0) / 100) : 0
  })
  if (draft.cargoOptions) {
    draft.cargoOptions.baseFee = basePrice
    draft.cargoOptions.distanceRate = extraPerKm
    draft.cargoOptions.maxDeliveryFee = maxDeliveryFee
  }
  if (remoteService && Array.isArray(remoteService.routes) && remoteService.routes.length) {
    const taskLines = remoteService.routes.map((route) => ({
      id: route.id,
      name: route.destinationName || route.city,
      originName: route.originName || '福鼎',
      destinationName: route.destinationName || route.city,
      price: Number(route.unitPriceFen || 0) / 100,
      priceUnit: route.priceUnit || 'PER_ORDER',
      pending: draft.taskId === 'send_parcel' || Number(route.unitPriceFen || 0) <= 1
    }))
    draft.remoteTaskLines = taskLines
    draft.selectedLine = taskLines.find((line) => draft.selectedLine && line.id === draft.selectedLine.id) || (isRouteTask(draft.taskId) ? null : taskLines[0])
  } else if (remoteService && Array.isArray(remoteService.routes)) {
    draft.remoteTaskLines = []
    draft.selectedLine = null
  }
  return true
}

module.exports = {
  PRIMARY_TASKS,
  COMMON_TASKS,
  ALL_TASKS,
  ROUTE_TASK_IDS,
  isRouteTask,
  HANDLING_TYPES,
  getTask,
  getDefaultItem,
  applyHandlingType,
  buildDraftService,
  applyRemoteConfigToDraft
}
