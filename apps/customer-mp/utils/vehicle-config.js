const VEHICLES = [
  {
    id: 'business_van',
    name: '7座商务车',
    shortName: '商务车',
    icon: '🚐',
    desc: '拼车固定车型',
    capacity: '最多6名乘客',
    tag: '拼车专用',
    baseFee: 35,
    vehicleFee: 0,
    distanceRate: 3.2,
    linePriceMultiplier: 1,
    maxDeliveryFee: 999,
    weightRate: 0,
    maxWeight: 30,
    passengerCapacity: 6,
    priceText: '按人计价'
  },
  {
    id: 'moving_van',
    name: '厢式货车',
    shortName: '厢货',
    icon: '🚚',
    desc: '搬家固定车型',
    capacity: '家具家电、多件物品',
    tag: '搬家专用',
    baseFee: 35,
    vehicleFee: 0,
    distanceRate: 3.2,
    linePriceMultiplier: 1,
    maxDeliveryFee: 168,
    weightRate: 0,
    maxWeight: 500,
    priceText: '35元起'
  },
  {
    id: 'small_car',
    name: '小车',
    shortName: '小车',
    icon: '🚗',
    desc: '适合寄货、拼车、小件货物',
    capacity: '30kg内 · 小于1立方米',
    tag: '拼小车推荐',
    baseFee: 35,
    vehicleFee: 0,
    distanceRate: 3.2,
    linePriceMultiplier: 1,
    maxDeliveryFee: 168,
    weightRate: 0,
    maxWeight: 30,
    priceText: '35元起'
  },
  {
    id: 'cargo_tricycle',
    name: '货三轮车',
    shortName: '货三轮',
    icon: '🛻',
    desc: '适合拉货、搬家、商家补货',
    capacity: '大件/多件货物',
    tag: '拉货推荐',
    baseFee: 28,
    vehicleFee: 0,
    distanceRate: 2.8,
    linePriceMultiplier: 0.85,
    maxDeliveryFee: 138,
    weightRate: 0,
    maxWeight: 300,
    priceText: '28元起'
  },
  {
    id: 'human_tricycle',
    name: '人力三轮车',
    shortName: '人力三轮',
    icon: '🛺',
    desc: '适合短途送货、送客',
    capacity: '短途轻便',
    tag: '短途省钱',
    baseFee: 15,
    vehicleFee: 0,
    distanceRate: 2,
    linePriceMultiplier: 0.65,
    maxDeliveryFee: 88,
    weightRate: 0,
    maxWeight: 80,
    priceText: '15元起'
  },
  {
    id: 'ebike',
    name: '二轮车',
    shortName: '二轮',
    icon: '🛵',
    desc: '适合急送、帮取、帮买',
    capacity: '小件快速送达',
    tag: '最快',
    baseFee: 10,
    vehicleFee: 0,
    distanceRate: 1.6,
    linePriceMultiplier: 0.55,
    maxDeliveryFee: 68,
    weightRate: 0,
    maxWeight: 10,
    priceText: '10元起'
  },
  {
    id: 'manual_labor',
    name: '人力服务',
    shortName: '人力',
    icon: '👷',
    desc: '适合装货、卸货',
    capacity: '装卸、搬运现场服务',
    tag: '人工服务',
    baseFee: 38,
    vehicleFee: 0,
    distanceRate: 0,
    linePriceMultiplier: 0.7,
    maxDeliveryFee: 88,
    weightRate: 0,
    maxWeight: 0,
    priceText: '38元起'
  }
]

function findVehicle(id) {
  return VEHICLES.find((item) => item.id === id) || VEHICLES[0]
}

function recommendVehicleId(draft) {
  return (draft && (draft.recommendedVehicleType || (draft.cargoOptions && draft.cargoOptions.vehicleId))) || 'small_car'
}

function buildCargoOptions(draft, vehicleId) {
  const vehicle = findVehicle(vehicleId)
  const weight = Number((draft && draft.weight) || 1)
  return {
    categoryId: (draft && draft.taskId) || 'task',
    categoryName: (draft && (draft.taskName || draft.service)) || '当前任务',
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    icon: vehicle.icon,
    vehicleShortName: vehicle.shortName,
    vehicleCapacity: vehicle.capacity,
    vehicleFee: vehicle.vehicleFee,
    baseFee: vehicle.baseFee,
    distanceRate: vehicle.distanceRate,
    linePriceMultiplier: vehicle.linePriceMultiplier,
    maxDeliveryFee: vehicle.maxDeliveryFee,
    weightRate: vehicle.weightRate,
    maxWeight: vehicle.maxWeight,
    weight,
    weightLabel: (draft && (draft.weightLabel || (draft.cargoOptions && draft.cargoOptions.weightLabel))) || '按任务填写'
  }
}

function applyVehicleToDraft(draft, vehicleId) {
  if (!draft) return findVehicle(vehicleId)
  const vehicle = findVehicle(vehicleId)
  const currentPricing = draft.servicePricing || {}
  const baseDistanceKm = Number(currentPricing.baseDistanceKm || 4)
  const serviceSurcharge = Number(currentPricing.serviceSurcharge || 0)
  draft.recommendedVehicleType = vehicle.id
  draft.recommendedVehicleName = vehicle.name
  draft.cargoOptions = buildCargoOptions(draft, vehicle.id)
  draft.servicePricing = {
    baseDistanceKm,
    basePrice: vehicle.baseFee,
    extraPerKm: vehicle.distanceRate,
    badWeatherMultiplier: Number(currentPricing.badWeatherMultiplier || 1),
    serviceSurcharge,
    linePriceMultiplier: vehicle.linePriceMultiplier,
    maxDeliveryFee: vehicle.maxDeliveryFee
  }
  const startingFee = vehicle.baseFee + serviceSurcharge
  if (draft.pricingMode === 'fixed_line_parcel' || draft.pricingMode === 'fixed_line_ride') {
    const selectedLine = draft.selectedLine || {}
    const lineFee = Math.min(Number(selectedLine.price || startingFee) * vehicle.linePriceMultiplier + serviceSurcharge, vehicle.maxDeliveryFee)
    draft.priceSummary = `${vehicle.name} · ${selectedLine.name || '当前线路'}约${Number(lineFee.toFixed(1))}元`
  } else if (vehicle.distanceRate > 0) {
    draft.priceSummary = `${vehicle.name} · ${baseDistanceKm}公里内${startingFee}元，超出${vehicle.distanceRate}元/公里，配送费不超过${vehicle.maxDeliveryFee}元`
  } else {
    draft.priceSummary = `${vehicle.name} · 预估${startingFee}元起，配送费不超过${vehicle.maxDeliveryFee}元`
  }
  return vehicle
}

module.exports = {
  VEHICLES,
  findVehicle,
  recommendVehicleId,
  buildCargoOptions,
  applyVehicleToDraft
}
