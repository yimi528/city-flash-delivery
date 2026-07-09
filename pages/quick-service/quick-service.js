const app = getApp()

const serviceConfigs = {
  drink: {
    id: 'drink',
    title: '取送饮料',
    kicker: '咖啡奶茶 · 酒水饮料 · 冰鲜饮品',
    subtitle: '写清门店、口味和杯数，骑手取到后立即送达。',
    icon: '饮',
    service: '帮送',
    defaultItem: '饮料/咖啡奶茶',
    placeholder: '例如：瑞幸两杯冰美式，少冰；或取一箱矿泉水',
    options: ['咖啡奶茶', '酒水饮料', '鲜榨果汁', '冰鲜饮品'],
    tips: ['建议写清杯数口味', '液体默认轻拿轻放', '可备注是否需要保温袋']
  },
  file: {
    id: 'file',
    title: '取送文件',
    kicker: '合同票据 · 证件材料 · 小件资料',
    subtitle: '适合文件、证件、票据等重要资料，支持保价和当面交接。',
    icon: '文',
    service: '帮送',
    defaultItem: '文件/证件',
    placeholder: '例如：取一份合同，交给 A 座 18 楼前台',
    options: ['合同票据', '证件材料', '小件资料', '同城文件'],
    tips: ['建议封袋密封', '重要证件请开启保价', '可备注取件码或联系人']
  },
  digital: {
    id: 'digital',
    title: '取送数码',
    kicker: '手机配件 · 相机电脑 · 维修取送',
    subtitle: '适合数码配件、维修件、小型电子设备，默认提醒骑手轻拿轻放。',
    icon: '数',
    service: '帮送',
    defaultItem: '数码配件',
    placeholder: '例如：取一个手机壳和充电器，送到公司前台',
    options: ['手机配件', '相机镜头', '电脑小件', '维修取送'],
    tips: ['易碎贵重建议保价', '写清型号规格', '外包装请尽量完整']
  },
  queue: {
    id: 'queue',
    title: '代排队',
    kicker: '取号排队 · 门店等位 · 现场代办',
    subtitle: '骑手到店排队/取号，完成后可送达或现场反馈。',
    icon: '排',
    service: '帮取',
    defaultItem: '排队取号',
    placeholder: '例如：到医院窗口取号，完成后电话联系我',
    options: ['医院取号', '餐厅等位', '门店排队', '现场代办'],
    tips: ['写清办理窗口', '预估等待时间越准确越好', '需要证件请提前说明']
  },
  more: {
    id: 'more',
    title: '更多服务',
    kicker: '鲜花蛋糕 · 宠物用品 · 临时跑腿',
    subtitle: '更多即时取送需求都可以先在这里下单。',
    icon: '全',
    service: '帮送',
    defaultItem: '同城跑腿',
    placeholder: '例如：取一束鲜花，送到万达 2 号门',
    options: ['鲜花蛋糕', '宠物用品', '药品保健', '临时跑腿'],
    tips: ['写清物品规格', '贵重物品建议保价', '特殊要求可写在备注']
  }
}

const serviceTabs = [
  { type: 'drink', name: '取送饮料', icon: '饮' },
  { type: 'file', name: '取送文件', icon: '文' },
  { type: 'digital', name: '取送数码', icon: '数' },
  { type: 'queue', name: '代排队', icon: '排' },
  { type: 'more', name: '更多服务', icon: '全' }
]

const weightOptions = [1, 3, 5, 10]

function getConfig(type) {
  return serviceConfigs[type] || serviceConfigs.drink
}

function getWeightLabel(weight) {
  if (weight <= 1) return '≤1公斤'
  return `${weight}公斤`
}

Page({
  data: {
    statusBarHeight: 24,
    city: '宁德市',
    type: 'drink',
    config: serviceConfigs.drink,
    serviceTabs,
    weightOptions,
    selectedOption: '咖啡奶茶',
    weight: 1,
    remark: '',
    pickup: null,
    dropoff: null
  },

  onLoad(query) {
    const type = query.type || 'drink'
    const config = getConfig(type)
    this.setData({
      type: config.id,
      config,
      selectedOption: config.options[0],
      remark: config.placeholder
    })
  },

  onShow() {
    const draft = app.globalData.draftOrder || {}
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      city: app.globalData.city,
      pickup: draft.pickup,
      dropoff: draft.dropoff
    })
  },

  switchType(event) {
    const config = getConfig(event.currentTarget.dataset.type)
    this.setData({
      type: config.id,
      config,
      selectedOption: config.options[0],
      remark: config.placeholder
    })
  },

  selectOption(event) {
    this.setData({ selectedOption: event.currentTarget.dataset.option })
  },

  selectWeight(event) {
    this.setData({ weight: Number(event.currentTarget.dataset.weight) })
  },

  inputRemark(event) {
    this.setData({ remark: event.detail.value })
  },

  chooseAddress(event) {
    wx.navigateTo({ url: `/pages/address/address?type=${event.currentTarget.dataset.type}` })
  },

  goOrder() {
    const config = this.data.config
    const pickup = app.globalData.draftOrder.pickup
    const dropoff = app.globalData.draftOrder.dropoff
    if (!dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }

    app.globalData.draftOrder.service = config.service
    app.globalData.draftOrder.item = this.data.selectedOption || config.defaultItem
    app.globalData.draftOrder.weight = this.data.weight
    app.globalData.draftOrder.remark = this.data.remark || config.placeholder
    app.globalData.draftOrder.quickServiceId = config.id
    app.globalData.draftOrder.quickServiceName = config.title
    app.globalData.draftOrder.pickup = pickup
    app.globalData.draftOrder.dropoff = dropoff
    app.globalData.draftOrder.cargoOptions = {
      categoryId: config.id,
      categoryName: this.data.selectedOption || config.defaultItem,
      vehicleId: 'ebike',
      vehicleName: '电动车空间',
      vehicleShortName: '电动车',
      vehicleCapacity: '56cm × 44cm × 38cm',
      vehicleFee: 0,
      weight: this.data.weight,
      weightLabel: getWeightLabel(this.data.weight)
    }

    wx.navigateTo({ url: '/pages/order-create/order-create?from=quick-service' })
  },

  goBack() {
    wx.navigateBack()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
