const PRIMARY_TASKS = [
  {
    id: 'send_parcel',
    name: '寄货',
    icon: '寄',
    subtitle: '拼小车寄货',
    desc: '30kg内，小于1立方米',
    vehicleType: 'small_car',
    vehicleName: '小车',
    priceSummary: '温州58 / 苍南20 / 秦屿30 / 龙安30',
    pricingMode: 'fixed_line_parcel',
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
    icon: '拼',
    subtitle: '拼小车拼车',
    desc: '固定线路拼车',
    vehicleType: 'small_car',
    vehicleName: '小车',
    priceSummary: '苍南40 / 温州150',
    pricingMode: 'fixed_line_ride',
    lines: [
      { id: 'cangnan_ride', name: '苍南', price: 40 },
      { id: 'wenzhou_ride', name: '温州', price: 150 }
    ]
  },
  {
    id: 'cargo_haul',
    name: '拉货',
    icon: '拉',
    subtitle: '货三轮车',
    desc: '市场拉货、商家补货',
    vehicleType: 'cargo_tricycle',
    vehicleName: '货三轮车',
    priceSummary: '4公里内58，超出5元/公里',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 58,
    extraPerKm: 5
  },
  {
    id: 'urgent_delivery',
    name: '急送',
    icon: '急',
    subtitle: '二轮急送',
    desc: '一对一快速送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '4公里内10，超出1.8元/公里',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.8,
    badWeatherMultiplier: 1.2
  }
]

const COMMON_TASKS = [
  {
    id: 'pickup',
    icon: '取',
    name: '帮取',
    subtitle: '二轮车',
    desc: '帮你取件再送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '4公里内10，超出1.8元/公里',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.8,
    badWeatherMultiplier: 1.2
  },
  {
    id: 'buy_for_me',
    icon: '买',
    name: '帮买',
    subtitle: '二轮车',
    desc: '帮买商品并送达',
    vehicleType: 'ebike',
    vehicleName: '二轮车',
    priceSummary: '4公里内10，超出1.8元/公里',
    pricingMode: 'distance_weather',
    baseDistanceKm: 4,
    basePrice: 10,
    extraPerKm: 1.8,
    badWeatherMultiplier: 1.2
  },
  {
    id: 'move_shop',
    icon: '搬',
    name: '搬家/搬店',
    subtitle: '推荐货三轮',
    desc: '价格待确认',
    vehicleType: 'cargo_tricycle',
    vehicleName: '货三轮车',
    priceSummary: '价格待甲方确认',
    pricingMode: 'manual_quote'
  },
  {
    id: 'load_goods',
    icon: '装',
    name: '装货',
    subtitle: '人力服务',
    desc: '可做附加服务',
    vehicleType: 'manual_labor',
    vehicleName: '人力服务',
    priceSummary: '价格待甲方确认',
    pricingMode: 'manual_quote'
  },
  {
    id: 'unload_goods',
    icon: '卸',
    name: '卸货',
    subtitle: '人力服务',
    desc: '可做附加服务',
    vehicleType: 'manual_labor',
    vehicleName: '人力服务',
    priceSummary: '价格待甲方确认',
    pricingMode: 'manual_quote'
  },
  {
    id: 'pedicab_delivery',
    icon: '三',
    name: '送货/送客',
    subtitle: '人力三轮车',
    desc: '短途送货或送客',
    vehicleType: 'human_tricycle',
    vehicleName: '人力三轮车',
    priceSummary: '4公里内12，超出3元/公里',
    pricingMode: 'distance',
    baseDistanceKm: 4,
    basePrice: 12,
    extraPerKm: 3
  }
]

const ALL_TASKS = PRIMARY_TASKS.concat(COMMON_TASKS)

const DEFAULT_ITEMS = {
  send_parcel: '文件/小件',
  carpool_ride: '1人',
  cargo_haul: '门店补货',
  urgent_delivery: '文件/小件',
  pickup: '快递包裹',
  buy_for_me: '万能帮买',
  move_shop: '搬家/搬店',
  load_goods: '装货',
  unload_goods: '卸货',
  pedicab_delivery: '短途送客'
}

function getTask(id) {
  return ALL_TASKS.find((item) => item.id === id) || PRIMARY_TASKS[0]
}

function getDefaultItem(taskId) {
  const task = getTask(taskId)
  return DEFAULT_ITEMS[task.id] || task.name
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
      badWeatherMultiplier: task.badWeatherMultiplier || 1
    }
  }
}

module.exports = {
  PRIMARY_TASKS,
  COMMON_TASKS,
  ALL_TASKS,
  getTask,
  getDefaultItem,
  buildDraftService
}
