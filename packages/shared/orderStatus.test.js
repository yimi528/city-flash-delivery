const assert = require('node:assert/strict')
const test = require('node:test')
const contracts = require('./orderStatus')

test('shared order status contract matches the API transport values', () => {
  assert.deepEqual(contracts.ORDER_STATUS_FLOW, [
    'PENDING',
    'ACCEPTED',
    'PICKING_UP',
    'DELIVERING',
    'COMPLETED'
  ])
  assert.deepEqual(contracts.ORDER_UPDATE_STATUSES, [
    ...contracts.ORDER_STATUS_FLOW,
    'CANCELLED'
  ])
  assert.deepEqual(contracts.ORDER_STATUS_LABELS, {
    PENDING: '待接单',
    ACCEPTED: '已接单',
    PICKING_UP: '取货中',
    DELIVERING: '配送中',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  })
})

test('shared roles match the persisted user role enum', () => {
  assert.deepEqual(contracts.APP_ROLES, {
    CUSTOMER: 'CUSTOMER',
    OPERATOR: 'OPERATOR',
    ADMIN: 'ADMIN',
    RIDER: 'RIDER'
  })
})
