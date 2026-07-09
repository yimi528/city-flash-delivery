const app = getApp()

const categories = [
  { id: 'universal', icon: '骑', name: '万能帮买', sample: '帮我买一杯热美式，少冰少糖' },
  { id: 'coffee', icon: '☕', name: '咖啡奶茶', sample: '帮我买两杯奶茶，一杯少糖一杯正常糖' },
  { id: 'drinks', icon: '🍺', name: '酒水饮料', sample: '帮我买一箱矿泉水和两瓶无糖茶' },
  { id: 'fruit', icon: '🍋', name: '新鲜水果', sample: '帮我买一份当季水果，预算内挑新鲜的' },
  { id: 'grocery', icon: '🥩', name: '买菜买肉', sample: '帮我买晚餐食材，青菜和鸡胸肉' },
  { id: 'medicine', icon: '💊', name: '药品保健', sample: '帮我去药店买常用感冒药' },
  { id: 'meal', icon: '🍱', name: '快餐外卖', sample: '帮我买一份简餐，口味清淡' },
  { id: 'daily', icon: '🧻', name: '日用百货', sample: '帮我买纸巾、洗衣液和垃圾袋' },
  { id: 'book', icon: '✒', name: '文具书籍', sample: '帮我买 A4 纸和黑色签字笔' },
  { id: 'mall', icon: '🛍', name: '商场专柜', sample: '帮我到商场专柜购买指定商品' }
]

const brands = [
  { name: '阿嬷手作', short: '阿' },
  { name: '霸王茶姬', short: '霸' },
  { name: '茉莉奶白', short: '茉' },
  { name: 'Manner', short: 'M' }
]

function findCategory(id) {
  return categories.find((item) => item.id === id) || categories[0]
}

function defaultPurchaseAddress() {
  const addresses = app.globalData.addresses || []
  return addresses.find((item) => item.tag === '门店') || addresses[3] || addresses[0] || {
    id: 'nearby-store',
    name: '骑手就近购买',
    detail: '骑手按需求就近选择门店',
    contact: '门店',
    phone: '13800000000',
    distance: '1.2km',
    distanceKm: 1.2,
    tag: '门店'
  }
}

function writeDraft(patch) {
  Object.keys(patch).forEach((key) => {
    app.globalData.draftOrder[key] = patch[key]
  })
}

Page({
  data: {
    statusBarHeight: 24,
    city: '宁德市',
    categories,
    brands,
    selectedCategory: 'universal',
    selectedCategoryName: '万能帮买',
    buyItems: '',
    budget: 50,
    purchaseAddress: null,
    dropoff: null
  },

  onShow() {
    const draft = app.globalData.draftOrder
    const category = findCategory(draft.buyCategoryId || this.data.selectedCategory)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      city: app.globalData.city,
      selectedCategory: category.id,
      selectedCategoryName: category.name,
      buyItems: draft.buyItems || '',
      budget: draft.budget || 50,
      purchaseAddress: draft.purchaseAddress,
      dropoff: draft.dropoff
    })
  },

  selectCategory(event) {
    const category = findCategory(event.currentTarget.dataset.id)
    const buyItems = this.data.buyItems || category.sample
    this.setData({
      selectedCategory: category.id,
      selectedCategoryName: category.name,
      buyItems
    })
    writeDraft({
      service: '帮买',
      item: category.name,
      buyCategoryId: category.id,
      buyCategoryName: category.name,
      buyItems
    })
  },

  fillSample() {
    const category = findCategory(this.data.selectedCategory)
    this.setData({ buyItems: category.sample })
    writeDraft({ buyItems: category.sample })
  },

  inputBuyItems(event) {
    const buyItems = event.detail.value
    this.setData({ buyItems })
    writeDraft({ buyItems })
  },

  inputBudget(event) {
    const budget = Number(event.detail.value || 0)
    this.setData({ budget })
    writeDraft({ budget })
  },

  choosePurchaseAddress() {
    wx.navigateTo({ url: '/pages/address/address?type=purchase' })
  },

  chooseDropoffAddress() {
    wx.navigateTo({ url: '/pages/address/address?type=dropoff' })
  },

  openIntro() {
    wx.showToast({ title: '填写商品和预算，骑手会先购买再送达', icon: 'none' })
  },

  goBack() {
    wx.navigateBack()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goOrder() {
    const category = findCategory(this.data.selectedCategory)
    const buyItems = String(this.data.buyItems || '').trim()
    const budget = Number(this.data.budget || 0)
    const purchaseAddress = this.data.purchaseAddress || defaultPurchaseAddress()

    if (!buyItems) {
      wx.showToast({ title: '请填写想买的商品', icon: 'none' })
      return
    }
    if (budget <= 0) {
      wx.showToast({ title: '请填写商品预算', icon: 'none' })
      return
    }
    if (!this.data.dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }

    writeDraft({
      service: '帮买',
      item: category.name,
      buyCategoryId: category.id,
      buyCategoryName: category.name,
      buyItems,
      budget,
      purchaseAddress,
      pickup: purchaseAddress,
      dropoff: this.data.dropoff,
      weight: 1,
      cargoOptions: {
        categoryId: 'daily',
        categoryName: category.name,
        vehicleId: 'ebike',
        vehicleName: '电动车空间',
        vehicleShortName: '电动车',
        vehicleCapacity: '56cm × 44cm × 38cm',
        vehicleFee: 0,
        weight: 1,
        weightLabel: '≤1公斤'
      },
      routeDistanceKm: 0,
      routeDistanceSource: '',
      routeDuration: ''
    })

    wx.navigateTo({ url: '/pages/order-create/order-create?from=city-buy' })
  }
})
