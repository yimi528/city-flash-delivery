const DEFAULT_MOCK_LOCATION = Object.freeze({
  latitude: 27.3245,
  longitude: 120.216,
  name: '福鼎市中心'
})

function getMockLocation() {
  let configured = null
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    configured = app && app.globalData && app.globalData.mapConfig && app.globalData.mapConfig.fallbackLocation
  } catch (error) {}

  const latitude = Number(configured && (configured.latitude || configured.lat))
  const longitude = Number(configured && (configured.longitude || configured.lng))
  return {
    latitude: Number.isFinite(latitude) ? latitude : DEFAULT_MOCK_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : DEFAULT_MOCK_LOCATION.longitude,
    speed: 0,
    accuracy: 50,
    source: 'mock',
    isMock: true
  }
}

module.exports = {
  DEFAULT_MOCK_LOCATION,
  getMockLocation
}
