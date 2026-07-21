const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const mapPath = path.resolve(__dirname, '../utils/map.js')

test('location failures do not silently use the hard-coded city center', async () => {
  global.wx = {
    getLocation(options) {
      options.fail({ errMsg: 'getLocation:fail auth deny' })
    }
  }
  global.getApp = () => ({
    globalData: {
      city: '福鼎市',
      currentLocation: null,
      mapConfig: {
        fallbackLocation: { latitude: 27.3245, longitude: 120.216 }
      }
    }
  })
  delete require.cache[require.resolve(mapPath)]
  const map = require(mapPath)

  await assert.rejects(map.getCurrentLocation(), (error) => error && /auth deny/.test(error.errMsg))
})
