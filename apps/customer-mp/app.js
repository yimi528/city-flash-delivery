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
    apiBaseUrl: 'http://127.0.0.1:8000/api',
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
    draftOrder: {
      service: '帮送',
      pickup: {
        id: 'a1',
        name: '恒生一品苑',
        detail: '东侨经济技术开发区福宁北路',
        contact: '陈先生',
        phone: '13809574581',
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
        categoryId: 'express',
        categoryName: '快递',
        vehicleId: 'ebike',
        vehicleName: '电动车空间',
        vehicleShortName: '电动车',
        vehicleCapacity: '56cm × 44cm × 38cm',
        vehicleFee: 0,
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
        phone: '13809574581',
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
    orders: [
      {
        id: 'S202607090012',
        status: '配送中',
        statusIndex: 2,
        service: '帮送',
        pickupName: '恒生一品苑',
        dropoffName: '宁德万达广场',
        item: '文件/小件',
        vehicleName: '电动车空间',
        weightLabel: '≤1公斤',
        fee: 14.8,
        distance: 2.4,
        eta: '约 18 分钟',
        rider: '张师傅',
        createTime: '今天 13:26'
      },
      {
        id: 'S202607080089',
        status: '已完成',
        statusIndex: 4,
        service: '帮取',
        pickupName: '华润便利店',
        dropoffName: '恒生一品苑',
        item: '饮料/日用品',
        vehicleName: '电动车空间',
        weightLabel: '≤1公斤',
        fee: 9.9,
        distance: 0.8,
        eta: '已送达',
        rider: '李师傅',
        createTime: '昨天 20:18'
      }
    ]
  }
})
