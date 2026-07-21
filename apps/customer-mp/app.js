let runtimeConfig = { resolveApiBaseUrl: () => 'http://127.0.0.1:3000/api' }
try {
  if (typeof require === 'function') runtimeConfig = require('./config/runtime')
} catch (error) {}

App({
  onLaunch() {
    const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {})
    this.globalData.statusBarHeight = systemInfo.statusBarHeight || 24
    this.globalData.windowWidth = systemInfo.windowWidth || 375
    try {
      const savedUser = wx.getStorageSync ? wx.getStorageSync('currentUser') : null
      const savedToken = wx.getStorageSync ? wx.getStorageSync('customerAuthToken') : ''
      const savedRiderToken = wx.getStorageSync ? wx.getStorageSync('riderAuthToken') : ''
      const savedRider = wx.getStorageSync ? wx.getStorageSync('currentRider') : null
      if (savedToken && !String(savedToken).startsWith('mock-token:')) {
        if (savedUser && savedUser.id) this.setCurrentUser(savedUser, savedToken)
      } else if (wx.removeStorageSync) {
        wx.removeStorageSync('customerAuthToken')
        wx.removeStorageSync('currentUser')
      }
      if (savedRiderToken) {
        this.globalData.riderAuthToken = savedRiderToken
        this.globalData.rider = savedRider || null
      }
    } catch (error) {}
    if (this.globalData.useBackend) {
      this.refreshAppConfig()
      this.ensureWechatLogin().catch(() => {})
    }
  },

  onShow() {
    const rider = this.globalData.rider
    if (this.globalData.riderAuthToken && rider && rider.online) this.startRiderPresence()
  },

  onHide() {},

  refreshAppConfig() {
    return new Promise((resolve) => {
      if (!wx.request) { resolve(null); return }
      wx.request({
        url: `${this.globalData.apiBaseUrl}/v1/app-config`,
        method: 'GET',
        header: this.globalData.authToken ? { Authorization: `Bearer ${this.globalData.authToken}` } : {},
        success: (response) => {
          if (response.statusCode < 200 || response.statusCode >= 300 || !response.data) { resolve(null); return }
          const config = response.data
          this.globalData.appConfig = config
          this.globalData.pricingVersion = Number(config.pricingVersion || (config.pricing && config.pricing.version) || 1)
          this.globalData.businessOpen = Boolean(config.operating && config.operating.openNow)
          this.globalData.announcement = config.announcement || null
          this.globalData.remoteServices = config.services || []
          this.globalData.customerServicePhone = String(config.customerService && config.customerService.phone || '').trim()
          resolve(config)
        },
        fail: () => resolve(null)
      })
    })
  },

  ensureWechatLogin() {
    if (this.globalData.isLoggedIn && this.globalData.authToken) {
      return Promise.resolve({ user: this.globalData.currentUser, token: this.globalData.authToken })
    }
    if (this.wechatLoginPromise) return this.wechatLoginPromise
    if (!this.globalData.useBackend || !wx.login) return Promise.reject(new Error('当前环境不支持微信登录'))
    const api = require('./utils/api')
    this.wechatLoginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: (result) => result && result.code ? resolve(result.code) : reject(new Error('微信登录凭证为空')),
        fail: () => reject(new Error('无法获取微信登录凭证'))
      })
    }).then((code) => api.wechatLogin({ code, userInfo: { nickName: '微信用户' } }))
      .then((session) => {
        this.setCurrentUser(Object.assign({}, session.user, {
          roles: session.roles,
          currentRole: session.currentRole
        }), session.token)
        return session
      })
      .finally(() => { this.wechatLoginPromise = null })
    return this.wechatLoginPromise
  },

  setCurrentUser(user, token) {
    this.globalData.currentUser = user
    this.globalData.userId = user.id || 'demo-user'
    this.globalData.isLoggedIn = true
    if (token) this.globalData.authToken = token
    this.globalData.accountRoles = user.roles || this.globalData.accountRoles || [{ role: 'customer', status: 'active' }]
    this.globalData.currentRole = user.currentRole || this.globalData.currentRole || 'customer'
    try {
      if (wx.setStorageSync) wx.setStorageSync('currentUser', user)
      if (token && wx.setStorageSync) wx.setStorageSync('customerAuthToken', token)
    } catch (error) {}
  },

  clearCurrentUser() {
    this.clearRiderSession()
    this.globalData.userId = 'demo-user'
    this.globalData.authToken = ''
    this.globalData.accountRoles = [{ role: 'customer', status: 'active' }]
    this.globalData.currentRole = 'customer'
    this.globalData.isLoggedIn = false
    this.globalData.currentUser = {
      id: '',
      phone: '',
      nickname: '',
      avatarUrl: '',
      memberLevel: ''
    }
    try {
      if (wx.removeStorageSync) {
        wx.removeStorageSync('currentUser')
        wx.removeStorageSync('customerAuthToken')
      }
    } catch (error) {}
  },

  setRiderSession(payload) {
    const session = payload || {}
    this.globalData.riderAuthToken = session.token || ''
    const rider = session.rider
      ? Object.assign({}, this.globalData.rider || {}, session.rider)
      : null
    this.globalData.rider = rider
    this.globalData.currentRole = 'rider'
    try {
      if (session.token && wx.setStorageSync) wx.setStorageSync('riderAuthToken', session.token)
      if (rider && wx.setStorageSync) wx.setStorageSync('currentRider', rider)
    } catch (error) {}
  },

  updateRider(rider) {
    const nextRider = rider
      ? Object.assign({}, this.globalData.rider || {}, rider)
      : null
    this.globalData.rider = nextRider
    try {
      if (nextRider && wx.setStorageSync) wx.setStorageSync('currentRider', nextRider)
    } catch (error) {}
  },

  clearRiderSession() {
    this.stopRiderPresence()
    this.globalData.riderAuthToken = ''
    this.globalData.rider = null
    this.globalData.currentRole = 'customer'
    try {
      if (wx.removeStorageSync) {
        wx.removeStorageSync('riderAuthToken')
        wx.removeStorageSync('currentRider')
      }
    } catch (error) {}
  },

  setCustomerRoleSession(payload) {
    const session = payload || {}
    if (session.token) {
      this.globalData.authToken = session.token
      try { if (wx.setStorageSync) wx.setStorageSync('customerAuthToken', session.token) } catch (error) {}
    }
    // Switching to the customer role must not end an active rider shift.
    // Keep the rider token and online state so the rider can return without
    // having to go online again. The rider can explicitly end the shift from
    // the rider workspace, which calls the API and updates this state.
    this.globalData.currentRole = 'customer'
    if (this.globalData.riderAuthToken && this.globalData.rider && this.globalData.rider.online) {
      this.startRiderPresence()
    }
  },

  startRiderPresence() {
    if (this.riderPresenceTimer || !this.globalData.riderAuthToken) return
    this.sendRiderPresence()
    this.riderPresenceTimer = setInterval(() => this.sendRiderPresence(), 30000)
  },

  stopRiderPresence() {
    if (!this.riderPresenceTimer) return
    clearInterval(this.riderPresenceTimer)
    this.riderPresenceTimer = null
  },

  sendRiderPresence() {
    const rider = this.globalData.rider
    if (!this.globalData.riderAuthToken || !rider || !rider.online) return
    const riderApi = require('./utils/rider-api')
    const heartbeat = (latitude, longitude) => riderApi.heartbeat(latitude, longitude)
      .then((nextRider) => this.updateRider(nextRider))
      .catch(() => {})
    wx.getLocation({
      type: 'gcj02',
      success: (location) => heartbeat(location.latitude, location.longitude),
      fail: () => heartbeat()
    })
  },

  globalData: {
    appRole: 'customer',
    statusBarHeight: 24,
    windowWidth: 375,
    userId: 'demo-user',
    authToken: '',
    riderAuthToken: '',
    rider: null,
    accountRoles: [{ role: 'customer', status: 'active' }],
    currentRole: 'customer',
    isLoggedIn: false,
    currentUser: {
      id: 'demo-user',
      phone: '138****4581',
      nickname: '微信用户',
      avatarUrl: '',
      memberLevel: '青铜会员'
    },
    useBackend: true,
    appConfig: null,
    remoteServices: [],
    customerServicePhone: '',
    businessOpen: true,
    announcement: null,
    pricingVersion: 0,
    apiBaseUrl: runtimeConfig.resolveApiBaseUrl(wx),
    city: '福鼎市',
    currentLocation: null,
    mapConfig: {
      // Key 默认由 NestJS 后端托管；此处仅用于无后端时的腾讯地图直连回退。
      tencentKey: '',
      defaultRegion: '福鼎市',
      distanceMode: 'bicycling',
      fallbackLocation: {
        latitude: 27.3245,
        longitude: 120.2160,
        name: '福鼎市中心'
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
        phone: '13700000000',
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
