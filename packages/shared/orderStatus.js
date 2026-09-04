// Keep transport-level values here. Display labels belong to each client.
const ORDER_STATUS_FLOW = ['PENDING', 'ACCEPTED', 'PICKING_UP', 'DELIVERING', 'COMPLETED']
const ORDER_UPDATE_STATUSES = [...ORDER_STATUS_FLOW, 'CANCELLED']
const ORDER_STATUS_LABELS = {
  PENDING: '待接单',
  ACCEPTED: '已接单',
  PICKING_UP: '取货中',
  DELIVERING: '配送中',
  COMPLETED: '已完成',
  CANCELLED: '已取消'
}
const APP_ROLES = {
  CUSTOMER: 'CUSTOMER',
  OPERATOR: 'OPERATOR',
  ADMIN: 'ADMIN',
  RIDER: 'RIDER'
}

module.exports = {
  ORDER_STATUS_FLOW,
  ORDER_UPDATE_STATUSES,
  ORDER_STATUS_LABELS,
  APP_ROLES
}
