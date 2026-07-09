const app = getApp()

const categories = [
  { id: 'food', icon: '食', name: '食品饮料', item: '食品饮料' },
  { id: 'express', icon: '快', name: '快递包裹', item: '快递包裹' },
  { id: 'flower', icon: '花', name: '鲜花蛋糕', item: '鲜花蛋糕' },
  { id: 'digital', icon: '数', name: '电子数码', item: '数码配件' },
  { id: 'furniture', icon: '家', name: '家具家纺', item: '家具家纺' },
  { id: 'queue', icon: '排', name: '排队取号', item: '排队取号' },
  { id: 'other', icon: '◇', name: '其他', item: '大件物品' }
]

const guaranteeOptions = [
  { id: 'g1', range: '价值0-200元', fee: '1元' },
  { id: 'g2', range: '价值201-400元', fee: '2元' },
  { id: 'g3', range: '价值401-600元', fee: '3元' },
  { id: 'g4', range: '价值601-1000元', fee: '5元' }
]

const weightMarks = [
  { value: 0, label: '0', major: true },
  { value: 1, label: '', major: false },
  { value: 2, label: '', major: false },
  { value: 3, label: '', major: false },
  { value: 4, label: '', major: false },
  { value: 5, label: '5', major: true },
  { value: 6, label: '', major: false },
  { value: 7, label: '', major: false },
  { value: 8, label: '', major: false },
  { value: 9, label: '', major: false },
  { value: 10, label: '10', major: true },
  { value: 11, label: '', major: false },
  { value: 12, label: '', major: false },
  { value: 13, label: '', major: false },
  { value: 14, label: '', major: false },
  { value: 15, label: '15', major: true }
]

const vehicles = [
  {
    id: 'ebike',
    name: '电动车空间',
    shortName: '电动车',
    capacity: '56cm × 44cm × 38cm',
    desc: '适合文件、小箱、鲜花、轻便日用品',
    fee: 0,
    displayFee: '基础车型',
    maxWeight: 10
  },
  {
    id: 'car',
    name: '汽车空间',
    shortName: '汽车',
    capacity: '1.4m × 1.3m × 0.8m',
    desc: '适合行李箱、小家具、多件包裹',
    fee: 15,
    displayFee: '+￥15 车型费',
    maxWeight: 50
  }
]

function findCategory(id) {
  return categories.find((item) => item.id === id) || categories[0]
}

function findVehicle(id) {
  return vehicles.find((item) => item.id === id) || vehicles[0]
}

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  if (weight < 10) return `${weight}公斤`
  return `${weight}公斤以上`
}

function getWeightPercent(weight) {
  const value = Math.max(0, Math.min(Number(weight || 1), 15))
  return Math.round((value / 15) * 100)
}

function weightState(weight) {
  return {
    weight,
    weightLabel: getWeightLabel(weight),
    weightPercent: getWeightPercent(weight)
  }
}

Page({
  data: {
    statusBarHeight: 24,
    categories,
    guaranteeOptions,
    weightMarks,
    vehicles,
    selectedCategory: 'food',
    selectedCategoryName: '食品饮料',
    selectedGuarantee: 'g1',
    selectedVehicle: 'ebike',
    weight: 1,
    weightLabel: '≤1公斤',
    weightPercent: 7,
    from: ''
  },

  onLoad(query) {
    const cargoOptions = app.globalData.draftOrder.cargoOptions || {}
    const weight = Number(cargoOptions.weight || app.globalData.draftOrder.weight || 1)
    const selectedCategory = cargoOptions.categoryId || 'food'
    const state = weightState(weight)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      from: query.from || '',
      selectedCategory,
      selectedCategoryName: findCategory(selectedCategory).name,
      selectedGuarantee: cargoOptions.guaranteeId || 'g1',
      selectedVehicle: cargoOptions.vehicleId || 'ebike',
      weight: state.weight,
      weightLabel: state.weightLabel,
      weightPercent: state.weightPercent
    })
  },

  selectCategory(event) {
    const selectedCategory = event.currentTarget.dataset.id
    this.setData({
      selectedCategory,
      selectedCategoryName: findCategory(selectedCategory).name
    })
  },

  selectGuarantee(event) {
    this.setData({ selectedGuarantee: event.currentTarget.dataset.id })
  },

  selectVehicle(event) {
    const selectedVehicle = event.currentTarget.dataset.id
    this.setData({ selectedVehicle })
  },

  changeWeight(event) {
    const weight = Number(event.detail.value)
    this.setData(weightState(weight))
  },

  quickWeight(event) {
    const weight = Number(event.currentTarget.dataset.weight)
    this.setData(weightState(weight))
  },

  confirm() {
    const category = findCategory(this.data.selectedCategory)
    const vehicle = findVehicle(this.data.selectedVehicle)
    const guarantee = guaranteeOptions.find((item) => item.id === this.data.selectedGuarantee) || guaranteeOptions[0]

    app.globalData.draftOrder.service = '送货'
    app.globalData.draftOrder.item = category.item
    app.globalData.draftOrder.weight = this.data.weight
    app.globalData.draftOrder.cargoOptions = {
      categoryId: category.id,
      categoryName: category.name,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleShortName: vehicle.shortName,
      vehicleCapacity: vehicle.capacity,
      vehicleFee: vehicle.fee,
      guaranteeId: guarantee.id,
      guaranteeRange: guarantee.range,
      guaranteeFee: guarantee.fee,
      weight: this.data.weight,
      weightLabel: this.data.weightLabel
    }

    wx.showToast({ title: '已选择配送工具', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBack() {
    wx.navigateBack()
  }
})
