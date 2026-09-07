const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const mapPath = path.resolve(__dirname, '../utils/map.js')

test('location helper uses an explicit mock coordinate without reading device location', async () => {
  global.wx = {}
  const globalData = {
    city: '福鼎市',
    currentLocation: null,
    mapConfig: {
      fallbackLocation: { latitude: 27.3245, longitude: 120.216 }
    }
  }
  global.getApp = () => ({
    globalData
  })
  delete require.cache[require.resolve(mapPath)]
  const map = require(mapPath)

  const location = await map.getCurrentLocation()
  assert.deepEqual(location, {
    latitude: 27.3245,
    longitude: 120.216,
    speed: 0,
    accuracy: 50,
    source: 'mock',
    isMock: true
  })
  assert.deepEqual(globalData.currentLocation, location)
})
