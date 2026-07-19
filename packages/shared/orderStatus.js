const ORDER_STATUS_FLOW = ['待商家接单', '待骑手接单', '前往履约地点', '服务中', '已完成']
const MERCHANT_STATUS_FLOW = ORDER_STATUS_FLOW
const APP_ROLES = {
  CUSTOMER: 'customer',
  MERCHANT: 'merchant',
  ADMIN: 'admin'
}

module.exports = {
  ORDER_STATUS_FLOW,
  MERCHANT_STATUS_FLOW,
  APP_ROLES
}
