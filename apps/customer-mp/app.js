App({
  onLaunch() {
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    this.globalData.statusBarHeight = systemInfo.statusBarHeight || 24
    this.globalData.windowWidth = systemInfo.windowWidth || 375
    try {
      const savedUser = wx.getStorageSync ? wx.getStorageSync('currentUser') : null
      if (savedUser && savedUser.id) {
        this.setCurrentUser(savedUser)
      }
      const savedToken = wx.getStorageSync ? wx.getStorageSync('customerAuthToken') : ''
      if (savedToken) this.globalData.authToken = savedToken
    } catch (error) {}
  },

  setCurrentUser(user, token) {
    this.globalData.currentUser = user
    this.globalData.userId = user.id || 'demo-user'
    this.globalData.isLoggedIn = true
    if (token) this.globalData.authToken = token
    try {
      if (wx.setStorageSync) wx.setStorageSync('currentUser', user)
      if (token && wx.setStorageSync) wx.setStorageSync('customerAuthToken', token)
    } catch (error) {}
  },

  globalData: {
    appRole: 'customer',
    statusBarHeight: 24,
    windowWidth: 375,
    userId: 'demo-user',
    authToken: 'mock-token:customer:demo-user',
    isLoggedIn: false,
    currentUser: {
      id: 'demo-user',
      phone: '138****4581',
      nickname: '微信用户',
      avatarUrl: '',
      memberLevel: '青铜会员'
    },
    useBackend: true,
    apiBaseUrl: 'http://127.0.0.1:3000/api',
    city: '宁德市',
    currentLocation: null,
    mapConfig: {
      // 填入腾讯位置服务 WebService Key 后可使用真实地址搜索/逆地址解析/距离矩阵。
      tencentKey: '',
      defaultRegion: '宁德市',
      distanceMode: 'bicycling',
      fallbackLocation: {
        latitude: 26.6657,
        longitude: 119.5482,
        name: '宁德市中心'
      }
    },
    orderFilter: '',
    features: {
      carpool: true,
      tricycle: true,
      bikeUrgent: true,
      buyForMe: true,
      delivery: true,
      pickup: true,
      cargo: true
    },
    draftOrder: {
      taskId: 'send_parcel',
      taskName: '寄货',
      serviceGroupId: 'small_car',
      serviceGroupName: '小车',
      serviceId: 'send_parcel',
      service: '寄货',
      subServiceId: 'send_parcel',
      subServiceName: '寄货',
      serviceDesc: '30kg内，小于1立方米',
      priceSummary: '温州58 / 苍南20 / 秦屿30 / 龙安30',
      pricingMode: 'fixed_line_parcel',
      recommendedVehicleType: 'small_car',
      recommendedVehicleName: '小车',
      selectedLine: { id: 'wenzhou_parcel', name: '温州', price: 58 },
      serviceLimits: { maxWeightKg: 30, maxVolumeM3: 1 },
      servicePricing: { baseDistanceKm: 4, basePrice: 35, extraPerKm: 3.2, badWeatherMultiplier: 1, serviceSurcharge: 0, linePriceMultiplier: 1, maxDeliveryFee: 168 },
      pickup: {
        id: 'a1',
        name: '恒生一品苑',
        detail: '东侨经济技术开发区福宁北路',
        contact: '陈先生',
        phone: '13800004581',
        distance: '0.3km',
        distanceKm: 0.3,
        latitude: 26.6824,
        longitude: 119.5558,
        location: { latitude: 26.6824, longitude: 119.5558 },
        tag: '发'
      },
      dropoff: null,
      item: '文件/小件',
      weight: 1,
      buyItems: '',
      budget: 50,
      purchaseAddress: null,
      routeDistanceKm: 0,
      routeDistanceSource: '',
      routeDuration: '',
      cargoOptions: {
        categoryId: 'send_parcel',
        categoryName: '寄货',
        vehicleId: 'small_car',
        vehicleName: '小车',
        vehicleShortName: '小车',
        vehicleCapacity: '30kg内 · 小于1立方米',
        vehicleFee: 0,
        baseFee: 35,
        distanceRate: 3.2,
        linePriceMultiplier: 1,
        maxDeliveryFee: 168,
        weightRate: 0,
        maxWeight: 30,
        weight: 1,
        weightLabel: '≤1公斤'
      },
      remark: ''
    },
    addresses: [
      {
        id: 'a1',
        name: '恒生一品苑',
        detail: '东侨经济技术开发区福宁北路 6 号',
        contact: '陈先生',
        phone: '13800004581',
        distance: '0.3km',
        distanceKm: 0.3,
        latitude: 26.6824,
        longitude: 119.5558,
        location: { latitude: 26.6824, longitude: 119.5558 },
        tag: '家'
      },
      {
        id: 'a2',
        name: '宁德万达广场',
        detail: '天湖东路 1 号 2 号门',
        contact: '林女士',
        phone: '13600001234',
        distance: '2.4km',
        distanceKm: 2.4,
        latitude: 26.6659,
        longitude: 119.5476,
        location: { latitude: 26.6659, longitude: 119.5476 },
        tag: '商圈'
      },
      {
        id: 'a3',
        name: '宁德市医院',
        detail: '蕉城区蕉城北路 7 号住院部',
        contact: '周先生',
        phone: '13900005678',
        distance: '3.1km',
        distanceKm: 3.1,
        latitude: 26.6711,
        longitude: 119.5326,
        location: { latitude: 26.6711, longitude: 119.5326 },
        tag: '医院'
      },
      {
        id: 'a4',
        name: '华润便利店',
        detail: '福宁北路与梦龙路交叉口',
        contact: '门店前台',
        phone: '0593-0000000',
        distance: '0.8km',
        distanceKm: 0.8,
        latitude: 26.6794,
        longitude: 119.5532,
        location: { latitude: 26.6794, longitude: 119.5532 },
        tag: '门店'
      }
    ],
    orders: []
  }
})
