const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const mapPath = path.resolve(__dirname, '../utils/map.js')
let requestHandler = null

global.wx = {
  request(options) {
    requestHandler(options)
  }
}

global.getApp = () => ({
  globalData: {
    useBackend: true,
    apiBaseUrl: 'http://127.0.0.1:3000/api',
    appRole: 'customer',
    authToken: 'test-token',
    city: '宁德市',
    currentLocation: { latitude: 26.68, longitude: 119.55 },
    mapConfig: { tencentKey: '', defaultRegion: '宁德市', distanceMode: 'bicycling' },
    addresses: []
  }
})

const map = require(mapPath)

test('address search uses the backend Tencent Map proxy', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/maps\/suggestion$/)
    options.success({
      statusCode: 200,
      data: {
        configured: true,
        items: [{ id: 'poi-1', title: '宁德万达广场', address: '天湖东路1号', location: { lat: 26.6659, lng: 119.5476 } }]
      }
    })
  }

  const results = await map.searchAddress('万达')

  assert.equal(results[0].name, '宁德万达广场')
  assert.equal(results[0].source, 'tencent')
})

test('reverse geocoding uses the backend proxy', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/maps\/reverse-geocode$/)
    options.success({
      statusCode: 200,
      data: {
        configured: true,
        result: {
          address: '福建省宁德市蕉城区天湖东路1号',
          formatted_addresses: { recommend: '宁德万达广场' },
          address_component: { city: '宁德市', district: '蕉城区' }
        }
      }
    })
  }

  const result = await map.reverseGeocode({ latitude: 26.6659, longitude: 119.5476 })

  assert.equal(result.name, '宁德万达广场')
  assert.equal(result.city, '宁德市')
})

test('route estimates use backend matrix distance', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/maps\/distance$/)
    options.success({
      statusCode: 200,
      data: { configured: true, route: { distanceKm: 2.6, duration: 12, source: '腾讯地图' } }
    })
  }

  const result = await map.estimateDistance(
    { latitude: 26.6824, longitude: 119.5558 },
    { latitude: 26.6659, longitude: 119.5476 }
  )

  assert.deepEqual(result, { distanceKm: 2.6, distance: 2.6, duration: 12, source: '腾讯地图' })
})
