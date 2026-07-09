App({
  onLaunch() {
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    this.globalData.statusBarHeight = systemInfo.statusBarHeight || 24
    this.globalData.windowWidth = systemInfo.windowWidth || 375
    try {
      const savedSession = wx.getStorageSync ? wx.getStorageSync('merchantSession') : null
      if (savedSession && savedSession.token) {
        this.setMerchantSession(savedSession)
      }
    } catch (error) {}
  },

  setMerchantSession(session) {
    this.globalData.authToken = session.token || this.globalData.authToken
    this.globalData.isLoggedIn = Boolean(session.token)
    if (session.merchant && session.merchant.id) {
      this.globalData.merchantId = session.merchant.id
      this.globalData.merchantStore = session.merchant
    }
    try {
      if (wx.setStorageSync) wx.setStorageSync('merchantSession', session)
    } catch (error) {}
  },

  globalData: {
    appRole: 'merchant',
    statusBarHeight: 24,
    windowWidth: 375,
    authToken: '',
    isLoggedIn: false,
    useBackend: true,
    apiBaseUrl: 'http://127.0.0.1:8000/api',
    merchantId: 'merchant-demo',
    merchantStore: {
      id: 'merchant-demo',
      name: '阿嬷手作宁德万达店',
      category: '咖啡奶茶',
      phone: '0593-8888888',
      address: '宁德万达广场 2 号门',
      status: '营业中',
      rating: 4.9
    },
    orders: []
  }
})
