const test = require('node:test')
const assert = require('node:assert/strict')

const { parseAddressText } = require('../utils/address-parser')

test('recognizes a shopping-style pasted contact, mobile number and address', () => {
  const result = parseAddressText('张三 13800138000 福建省宁德市福鼎市桐城街道恒生一品苑2单元301')

  assert.equal(result.contact, '张三')
  assert.equal(result.phone, '13800138000')
  assert.match(result.address, /恒生一品苑2单元301/)
  assert.equal(result.name, '恒生一品苑')
})

test('recognizes labelled multiline receiver information', () => {
  const result = parseAddressText('收货人：李小明\n电话：13912345678\n收货地址：福建省宁德市福鼎市太姥山镇海滨花园6栋802')

  assert.equal(result.contact, '李小明')
  assert.equal(result.phone, '13912345678')
  assert.equal(result.address, '福建省宁德市福鼎市太姥山镇海滨花园6栋802')
  assert.equal(result.name, '海滨花园')
})
