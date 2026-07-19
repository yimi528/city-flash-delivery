const test = require('node:test')
const assert = require('node:assert/strict')

const STORAGE_KEY = 'address-use-stats-v1'

function loadAddressBook(storage) {
  global.wx = {
    getStorageSync(key) {
      return storage[key]
    },
    setStorageSync(key, value) {
      storage[key] = value
    }
  }
  delete require.cache[require.resolve('../utils/address-book')]
  return require('../utils/address-book')
}

test('frequent addresses rank ahead of defaults and recent addresses', () => {
  const addressBook = loadAddressBook({
    [STORAGE_KEY]: {
      frequent: { usageCount: 4, lastUsedAt: '2026-07-16T08:00:00.000Z' }
    }
  })
  const ranked = addressBook.rank([
    { id: 'default', isDefault: true, usageCount: 0, updatedAt: '2026-07-16T10:00:00.000Z' },
    { id: 'frequent', isDefault: false, usageCount: 1, updatedAt: '2026-07-15T10:00:00.000Z' },
    { id: 'recent', isDefault: false, usageCount: 0, updatedAt: '2026-07-16T11:00:00.000Z' }
  ])

  assert.deepEqual(ranked.map((item) => item.id), ['frequent', 'default', 'recent'])
  assert.equal(ranked[0].usageCount, 4)
})

test('selecting a saved address persists another use locally', () => {
  const storage = {}
  const addressBook = loadAddressBook(storage)
  const used = addressBook.recordUse({ id: 'home', usageCount: 2 })

  assert.equal(used.usageCount, 3)
  assert.equal(storage[STORAGE_KEY].home.usageCount, 3)
  assert.match(storage[STORAGE_KEY].home.lastUsedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('deleting an address clears recommendations and matching order draft state', () => {
  const storage = {
    [STORAGE_KEY]: {
      home: { usageCount: 5, lastUsedAt: '2026-07-16T08:00:00.000Z' }
    }
  }
  const addressBook = loadAddressBook(storage)
  const globalData = {
    addresses: [{ id: 'home', isDefault: true }, { id: 'office', isDefault: false }],
    draftOrder: {
      pickup: { id: 'home' },
      dropoff: { id: 'office' },
      purchaseAddress: { id: 'home' },
      routeDistanceKm: 8,
      routeDistanceSource: '腾讯地图',
      routeDuration: 20
    }
  }

  addressBook.syncDeletedAddress(globalData, 'home', 'office')

  assert.deepEqual(globalData.addresses, [{ id: 'office', isDefault: true }])
  assert.equal(globalData.draftOrder.pickup, null)
  assert.equal(globalData.draftOrder.purchaseAddress, null)
  assert.deepEqual(globalData.draftOrder.dropoff, { id: 'office' })
  assert.equal(globalData.draftOrder.routeDistanceKm, 0)
  assert.equal(storage[STORAGE_KEY].home, undefined)
})
