const MOBILE_PHONE_RE = /^1[3-9]\d{9}$/

function normalizedAddress(address) {
  const source = address || {}
  return {
    name: String(source.name || '').trim(),
    detail: String(source.detail || '').trim(),
    contact: String(source.contact || '').trim(),
    phone: String(source.phone || '').trim()
  }
}

function validateAddress(address) {
  const value = normalizedAddress(address)
  if (!value.name) return { valid: false, field: 'name', message: '请选择地址' }
  if (!value.detail) return { valid: false, field: 'detail', message: '请填写门牌号' }
  if (!value.contact) return { valid: false, field: 'contact', message: '请填写联系人' }
  if (!MOBILE_PHONE_RE.test(value.phone)) return { valid: false, field: 'phone', message: '请输入正确的11位手机号' }
  return { valid: true, value }
}

module.exports = {
  MOBILE_PHONE_RE,
  normalizedAddress,
  validateAddress
}
