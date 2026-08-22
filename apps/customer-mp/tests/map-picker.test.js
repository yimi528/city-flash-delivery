const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve))
}

function loadPicker(options) {
  const app = {
    globalData: {
      statusBarHeight: 26,
      draftOrder: {
        pickup: { latitude: 27.51, longitude: 120.4 },
        selectedLine: { id: 'cangnan' }
      },
      addresses: [],
      currentLocation: null
    }
  }
  let pageDefinition = null
  let centerLocation = options.centerLocation
  const mapModule = {
    normalizePoint(value) {
      if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null
      return { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    },
    reverseGeocode(point) {
      return Promise.resolve({
        name: '测试大厦',
        detail: '浙江省温州市苍南县测试路1号',
        city: '温州市',
        district: '苍南县',
        adcode: '330327',
        latitude: point.latitude,
        longitude: point.longitude,
        source: 'tencent'
      })
    },
    getCurrentLocation() {
      return Promise.resolve({ latitude: 27.52, longitude: 120.41 })
    }
  }
  const carpoolModule = {
    getRoute() { return { id: 'cangnan', name: '苍南' } },
    isSelectedCityAddress(address) { return address && address.adcode === '330327' },
    applySelectedAddress(draft, address, type) {
      draft[type] = address
      return { id: 'cangnan', name: '苍南' }
    }
  }
  const wx = {
    createMapContext() {
      return {
        getCenterLocation(callbacks) { callbacks.success(centerLocation) }
      }
    },
    navigateBack() {},
    showToast(options) { this.toasts.push(options) },
    toasts: []
  }
  const source = fs.readFileSync(path.join(root, 'pages/map-picker/map-picker.js'), 'utf8')
  vm.runInNewContext(source, {
    getApp: () => app,
    Page(definition) { pageDefinition = definition },
    require(request) {
      if (request === '../../utils/map') return mapModule
      if (request === '../../utils/carpool') return carpoolModule
      if (request === '../../utils/address-validation') return require(path.join(root, 'utils/address-validation.js'))
      throw new Error(`Unexpected module: ${request}`)
    },
    wx,
    setTimeout,
    console
  }, { filename: 'map-picker.js' })

  const page = Object.assign({}, pageDefinition, {
    data: Object.assign({}, pageDefinition.data),
    setData(update, callback) {
      Object.keys(update).forEach((key) => { this.data[key] = update[key] })
      if (callback) callback()
    }
  })
  return { app, page, setCenter(value) { centerLocation = value } }
}

test('map picker is registered and uses the native Tencent map center pin flow', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'pages/map-picker/map-picker.wxml'), 'utf8')
  const addressTemplate = fs.readFileSync(path.join(root, 'pages/address/address.wxml'), 'utf8')
  const addressEdit = fs.readFileSync(path.join(root, 'pages/address-edit/address-edit.js'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/map-picker/map-picker'))
  assert.match(template, /<map[\s\S]*bindregionchange="onRegionChange"/)
  assert.match(template, /<cover-image[\s\S]*class="center-pin/)
  assert.match(template, /src="\.\.\/\.\.\/assets\/map-pin\.png"/)
  assert.match(template, /联系人 <text>\*<\/text>/)
  assert.match(template, /手机号 <text>\*<\/text>/)
  assert.match(addressTemplate, /bindtap="openMapPicker"/)
  assert.match(addressEdit, /this\.selectAfterSave = query\.from === 'map'/)
  assert.match(addressEdit, /draftOrder\[draftKey\(this\.data\.type\)\]/)
})

test('moving the map resolves its center coordinate and uses it after the form is completed', async () => {
  const fixture = loadPicker({ centerLocation: { latitude: 27.50999, longitude: 120.40555 } })
  fixture.page.onLoad({ type: 'pickup' })
  fixture.page.onReady()
  await flushPromises()

  fixture.page.onRegionChange({ type: 'begin' })
  assert.equal(fixture.page.data.moving, true)
  fixture.page.onRegionChange({ type: 'end' })
  await flushPromises()

  assert.equal(fixture.page.data.selectedAddress.name, '测试大厦')
  assert.equal(fixture.page.data.selectedAddress.latitude, 27.50999)
  assert.equal(fixture.page.data.selectedAddress.longitude, 120.40555)

  fixture.page.data.form.detail = '测试路1号'
  fixture.page.data.form.contact = '发货联系人'
  fixture.page.data.form.phone = '13800000000'
  fixture.page.confirmLocation()
  assert.equal(fixture.app.globalData.draftOrder.pickup.latitude, 27.50999)
  assert.equal(fixture.app.globalData.draftOrder.pickup.longitude, 120.40555)
  assert.equal(fixture.app.globalData.draftOrder.pickup.detail, '测试路1号')
})

test('pickup map confirmation collects the contact required by order submission', async () => {
  const fixture = loadPicker({ centerLocation: { latitude: 27.50999, longitude: 120.40555 } })
  fixture.app.globalData.draftOrder.pickup = undefined
  fixture.page.onLoad({ type: 'pickup', from: 'add' })
  fixture.page.onReady()
  await flushPromises()

  fixture.page.data.form.detail = '测试路1号'
  fixture.page.confirmLocation()
  assert.equal(fixture.app.globalData.draftOrder.pickup, undefined)
  assert.match(fixture.page.data.requiresContact ? fixture.page.data.form.contact : '', /^$/)

  fixture.page.data.form.contact = '发货联系人'
  fixture.page.data.form.phone = '13800000000'
  fixture.page.confirmLocation()
  assert.equal(fixture.app.globalData.draftOrder.pickup.contact, '发货联系人')
  assert.equal(fixture.app.globalData.draftOrder.pickup.phone, '13800000000')
})

test('carpool map confirmation preserves route parameters', async () => {
  const fixture = loadPicker({ centerLocation: { latitude: 27.51, longitude: 120.4 } })
  fixture.page.onLoad({ type: 'dropoff', mode: 'carpool', route: 'cangnan' })
  fixture.page.onReady()
  await flushPromises()
  fixture.page.data.form.detail = '苍南测试路1号'
  fixture.page.data.form.contact = '测试用户'
  fixture.page.data.form.phone = '13800000000'
  fixture.page.confirmLocation()

  assert.equal(fixture.app.globalData.draftOrder.dropoff.detail, '苍南测试路1号')
  assert.equal(fixture.app.globalData.draftOrder.dropoff.latitude, 27.52)
})
