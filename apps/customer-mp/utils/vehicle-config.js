const VEHICLES = [
  {
    id: 'small_car',
    name: '小车',
    shortName: '小车',
    icon: '🚗',
    desc: '适合寄货、拼车、小件货物',
    capacity: '30kg内 · 小于1立方米',
    tag: '拼小车推荐',
    baseFee: 58,
    vehicleFee: 0,
    distanceRate: 0,
    weightRate: 0,
    maxWeight: 30,
    priceText: '固定价'
  },
  {
    id: 'cargo_tricycle',
    name: '货三轮车',
    shortName: '货三轮',
    icon: '🛺',
    desc: '适合拉货、搬家、商家补货',
    capacity: '大件/多件货物',
    tag: '拉货推荐',
    baseFee: 58,
    vehicleFee: 0,
    distanceRate: 5,
    weightRate: 0,
    maxWeight: 300,
    priceText: '58元起'
  },
  {
    id: 'human_tricycle',
    name: '人力三轮车',
    shortName: '人力三轮',
    icon: '🚲',
    desc: '适合短途送货、送客',
    capacity: '短途轻便',
    tag: '短途省钱',
    baseFee: 12,
    vehicleFee: 0,
    distanceRate: 3,
    weightRate: 0,
    maxWeight: 80,
    priceText: '12元起'
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
    distanceRate: 1.8,
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
    baseFee: 58,
    vehicleFee: 0,
    distanceRate: 0,
    weightRate: 0,
    maxWeight: 0,
    priceText: '58元起'
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
    weightRate: vehicle.weightRate,
    maxWeight: vehicle.maxWeight,
    weight,
    weightLabel: (draft && (draft.weightLabel || (draft.cargoOptions && draft.cargoOptions.weightLabel))) || '按任务填写'
  }
}

function applyVehicleToDraft(draft, vehicleId) {
  if (!draft) return findVehicle(vehicleId)
  const vehicle = findVehicle(vehicleId)
  draft.recommendedVehicleType = vehicle.id
  draft.recommendedVehicleName = vehicle.name
  draft.cargoOptions = buildCargoOptions(draft, vehicle.id)
  return vehicle
}

module.exports = {
  VEHICLES,
  findVehicle,
  recommendVehicleId,
  buildCargoOptions,
  applyVehicleToDraft
}
