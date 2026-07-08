const app = getApp()

const categories = [
  { id: 'furniture', icon: '🛋️', name: '家具家纺', item: '家具家纺' },
  { id: 'queue', icon: '⌛', name: '排队取号', item: '排队取号' },
  { id: 'express', icon: '📦', name: '快递', item: '快递包裹' },
  { id: 'other', icon: '◇', name: '其他', item: '大件物品' }
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

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  if (weight < 10) return `${weight}公斤`
  return `${weight}公斤以上`
}

Page({
  data: {
    statusBarHeight: 24,
    categories,
    vehicles,
    selectedCategory: 'furniture',
    selectedVehicle: 'car',
    weight: 1,
    weightLabel: '≤1公斤',
    from: ''
  },

  onLoad(query) {
    const cargoOptions = app.globalData.draftOrder.cargoOptions || {}
    const weight = Number(cargoOptions.weight || app.globalData.draftOrder.weight || 1)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      from: query.from || '',
      selectedCategory: cargoOptions.categoryId || 'furniture',
      selectedVehicle: cargoOptions.vehicleId || 'car',
      weight,
      weightLabel: getWeightLabel(weight)
    })
  },

  selectCategory(event) {
    const selectedCategory = event.currentTarget.dataset.id
    this.setData({ selectedCategory })
  },

  selectVehicle(event) {
    const selectedVehicle = event.currentTarget.dataset.id
    this.setData({ selectedVehicle })
  },

  changeWeight(event) {
    const weight = Number(event.detail.value)
    this.setData({ weight, weightLabel: getWeightLabel(weight) })
  },

  quickWeight(event) {
    const weight = Number(event.currentTarget.dataset.weight)
    this.setData({ weight, weightLabel: getWeightLabel(weight) })
  },

  confirm() {
    const category = categories.find((item) => item.id === this.data.selectedCategory) || categories[0]
    const vehicle = vehicles.find((item) => item.id === this.data.selectedVehicle) || vehicles[0]

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
