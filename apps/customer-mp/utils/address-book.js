const STORAGE_KEY = 'address-use-stats-v1'

function readStats() {
  try {
    return wx.getStorageSync ? (wx.getStorageSync(STORAGE_KEY) || {}) : {}
  } catch (error) {
    return {}
  }
}

function writeStats(stats) {
  try {
    if (wx.setStorageSync) wx.setStorageSync(STORAGE_KEY, stats)
  } catch (error) {}
}

function usageMeta(address, stats) {
  const local = (stats || readStats())[address.id] || {}
  const remoteCount = Number(address.usageCount || 0)
  const localCount = Number(local.usageCount || 0)
  return {
    usageCount: Math.max(remoteCount, localCount),
    lastUsedAt: local.lastUsedAt || address.lastUsedAt || ''
  }
}

function rank(items) {
  const stats = readStats()
  return (items || []).map((item) => Object.assign({}, item, usageMeta(item, stats))).sort((left, right) => {
    const countDelta = Number(right.usageCount || 0) - Number(left.usageCount || 0)
    if (countDelta) return countDelta
    const usedDelta = new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime()
    if (usedDelta) return usedDelta
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
  })
}

function recordUse(address) {
  if (!address || !address.id || address.isMapResult) return address
  const stats = readStats()
  const current = usageMeta(address, stats)
  const next = {
    usageCount: Number(current.usageCount || 0) + 1,
    lastUsedAt: new Date().toISOString()
  }
  stats[address.id] = next
  writeStats(stats)
  return Object.assign({}, address, next)
}

function forget(addressId) {
  if (!addressId) return
  const stats = readStats()
  if (!stats[addressId]) return
  delete stats[addressId]
  writeStats(stats)
}

function syncDeletedAddress(globalData, addressId, defaultAddressId) {
  const state = globalData || {}
  state.addresses = (state.addresses || []).filter((item) => item.id !== addressId).map((item) => (
    defaultAddressId === undefined ? item : Object.assign({}, item, { isDefault: item.id === defaultAddressId })
  ))
  const draft = state.draftOrder || {}
  ;['pickup', 'dropoff', 'purchaseAddress'].forEach((key) => {
    if (draft[key] && draft[key].id === addressId) draft[key] = null
  })
  if (!draft.pickup || !draft.dropoff) {
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
  }
  if (state.pendingMapAddress && state.pendingMapAddress.id === addressId) state.pendingMapAddress = null
  forget(addressId)
  return state.addresses
}

module.exports = { rank, recordUse, forget, syncDeletedAddress }
