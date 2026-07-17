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

module.exports = { rank, recordUse }
