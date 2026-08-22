const assert = require('node:assert/strict')
const test = require('node:test')
const { validateAddress } = require('../utils/address-validation')

const completeAddress = {
  name: '福鼎市人民政府',
  detail: '河墘路西侧1号',
  contact: '测试联系人',
  phone: '13800000000'
}

test('all address entry points require address, door number, contact and mobile', () => {
  assert.deepEqual(validateAddress(completeAddress), {
    valid: true,
    value: completeAddress
  })
  assert.equal(validateAddress({ ...completeAddress, contact: '' }).field, 'contact')
  assert.equal(validateAddress({ ...completeAddress, phone: '1380000000' }).field, 'phone')
  assert.equal(validateAddress({ ...completeAddress, name: '' }).field, 'name')
  assert.equal(validateAddress({ ...completeAddress, detail: '' }).field, 'detail')
})
