const ORDER_STATUS_FLOW = ['待接单', '已接单', '取货中', '配送中', '已完成']
const MERCHANT_STATUS_FLOW = ['待接单', '备货中', '待骑手取货', '已交付']
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
