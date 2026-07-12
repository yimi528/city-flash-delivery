const PRIMARY_TASKS = [
  {
    id: 'send_parcel',
    name: '寄货',
    icon: '📦',
    subtitle: '拼小车寄货',
    desc: '30kg内，小于1立方米',
    vehicleType: 'small_car',
    vehicleName: '小车',
    priceSummary: '温州58 / 苍南20 / 秦屿30 / 龙安30',
    pricingMode: 'fixed_line_parcel',
    serviceSurcharge: 0,
    lines: [
      { id: 'wenzhou_parcel', name: '温州', price: 58 },
      { id: 'cangnan_parcel', name: '苍南', price: 20 },
      { id: 'qinyu_parcel', name: '秦屿', price: 30 },
      { id: 'longan_parcel', name: '龙安', price: 30 }
    ],
    limits: { maxWeightKg: 30, maxVolumeM3: 1 }
  },
  {
    id: 'carpool_ride',
    name: '拼车',
    icon: '🚘',
    subtitle: '拼小车拼车',
    desc: '固定线路拼车',
    vehicleType: 'business_van',
    vehicleName: '7座商务车',
    priceSummary: '苍南40元/人 · 温州150元/人',
    pricingMode: 'fixed_line_ride',
    serviceSurcharge: 0,
    lines: [
      { id: 'cangnan', name: '苍南', price: 40 },
      { id: 'wenzhou', name: '温州', price: 150 }
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
    priceSummary: '推荐货三轮，4公里内33元',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 28,
    extraPerKm: 2.8,
    serviceSurcharge: 5
  },
  {
    id: 'urgent_delivery',
    name: '急送',
    icon: '⚡',
    subtitle: '二轮急送',
    desc: '一对一快速送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '二轮车4公里内13元，超出1.6元/公里',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.6,
    badWeatherMultiplier: 1.15,
    serviceSurcharge: 3
  }
]

const HANDLING_TYPES = [
  {
    name: '搬家/搬店',
    icon: '搬',
    desc: '住宅、宿舍或门店整体搬运',
    vehicleId: 'manual_labor',
    vehicleName: '人力服务',
    serviceSurcharge: 10,
    priceSummary: '上门搬运固定48元'
  },
  {
    name: '装货',
    icon: '装',
    desc: '协助装车、码放和短时搬运',
    vehicleId: 'manual_labor',
    vehicleName: '人力服务',
    serviceSurcharge: 10,
    priceSummary: '上门装货固定48元'
  },
  {
    name: '卸货',
    icon: '卸',
    desc: '协助卸车、入库和搬至指定位置',
    vehicleId: 'manual_labor',
    vehicleName: '人力服务',
    serviceSurcharge: 10,
    priceSummary: '上门卸货固定48元'
  }
]

const COMMON_TASKS = [
  {
    id: 'moving',
    icon: '🏠',
    name: '搬家',
    subtitle: '厢式货车',
    desc: '住宅、宿舍或门店整体搬运',
    vehicleType: 'moving_van',
    vehicleName: '厢式货车',
    priceSummary: '厢式货车固定车型，55元起',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 35,
    extraPerKm: 3.2,
    serviceSurcharge: 20
  },
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
    badWeatherMultiplier: 1.15,
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
    priceSummary: '商品价格另加配送费，二轮车12元起',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.6,
    badWeatherMultiplier: 1.15,
    serviceSurcharge: 2
  },
  {
    id: 'moving_handling',
    icon: '🏗️',
    name: '搬运装卸',
    subtitle: '搬家 · 搬店 · 装卸',
    desc: '统一提交搬运需求',
    vehicleType: 'manual_labor',
    vehicleName: '人力服务',
    priceSummary: '上门搬运固定48元，需要配送时另计里程费',
    pricingMode: 'handling_fixed',
    baseDistanceKm: 4,
    basePrice: 28,
    extraPerKm: 2.8,
    serviceSurcharge: 20
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
  'carpool_ride',
  'cargo_haul',
  'moving',
  'moving_handling',
  'send_parcel',
  'urgent_delivery',
  'pickup',
  'buy_for_me',
  'pedicab_delivery'
].map((id) => TASKS_BY_ID[id])

const DEFAULT_ITEMS = {
  send_parcel: '文件/小件',
  carpool_ride: '1人',
  cargo_haul: '门店补货',
  moving: '搬家',
  urgent_delivery: '文件/小件',
  pickup: '快递包裹',
  buy_for_me: '万能帮买',
  moving_handling: '搬家/搬店',
  pedicab_delivery: '短途送客'
}

function normalizeTaskId(id) {
  if (id === 'move_shop' || id === 'load_goods' || id === 'unload_goods') return 'moving_handling'
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
  const handlingType = HANDLING_TYPES.find((item) => item.name === itemName) || HANDLING_TYPES[0]
  draft.item = handlingType.name
  draft.recommendedVehicleType = handlingType.vehicleId
  draft.recommendedVehicleName = handlingType.vehicleName
  draft.priceSummary = handlingType.priceSummary
  draft.servicePricing = {
    baseDistanceKm: 4,
    basePrice: 0,
    extraPerKm: 0,
    badWeatherMultiplier: 1,
    serviceSurcharge: handlingType.serviceSurcharge
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
    selectedLine: task.lines ? task.lines[0] : null,
    serviceLimits: task.limits || null,
    badWeather: false,
    servicePricing: {
      baseDistanceKm: task.baseDistanceKm || 0,
      basePrice: task.basePrice || 0,
      extraPerKm: task.extraPerKm || 0,
      badWeatherMultiplier: task.badWeatherMultiplier || 1,
      serviceSurcharge: task.serviceSurcharge || 0
    }
  }
}

module.exports = {
  PRIMARY_TASKS,
  COMMON_TASKS,
  ALL_TASKS,
  HANDLING_TYPES,
  getTask,
  getDefaultItem,
  applyHandlingType,
  buildDraftService
}
