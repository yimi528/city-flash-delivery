App({
  onLaunch() {
    const token = wx.getStorageSync('riderAuthToken') || ''
    const rider = wx.getStorageSync('currentRider') || null
    this.globalData.authToken = token
    this.globalData.rider = rider
  },
  setSession(payload) {
    this.globalData.authToken = payload.token
    this.globalData.rider = payload.rider
    wx.setStorageSync('riderAuthToken', payload.token)
    wx.setStorageSync('currentRider', payload.rider)
  },
  clearSession() {
    this.globalData.authToken = ''
    this.globalData.rider = null
    wx.removeStorageSync('riderAuthToken')
    wx.removeStorageSync('currentRider')
  },
  globalData: {
    apiBaseUrl: 'https://api.example.com/api',
    authToken: '',
    rider: null
  }
})
