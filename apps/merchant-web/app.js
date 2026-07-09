const DEFAULT_API_BASE = 'http://127.0.0.1:8000/api'
const OPERATOR_ID = 'merchant-demo'
const orderFilters = ['全部', '待接单', '已接单', '取货中', '配送中', '已完成', '已取消']

const state = {
  apiBase: localStorage.getItem('merchantApiBase') || DEFAULT_API_BASE,
  token: localStorage.getItem('merchantToken') || '',
  operatorId: localStorage.getItem('merchantId') || OPERATOR_ID,
  activeFilter: '全部',
  orders: [],
  store: null,
  refreshing: false
}

const $ = (selector) => document.querySelector(selector)

function toast(message) {
  const el = $('#toast')
  el.textContent = message
  el.classList.add('show')
  window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => el.classList.remove('show'), 2200)
}

function headers() {
  const result = {
    'Content-Type': 'application/json',
    'X-App-Role': 'merchant'
  }
  if (state.token) result.Authorization = `Bearer ${state.token}`
  return result
}

async function api(path, options = {}) {
  const response = await fetch(`${state.apiBase}${path}`, {
    method: options.method || 'GET',
    headers: headers(),
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

function actionLabel(status) {
  if (status === '待接单') return '接单'
  if (status === '已接单') return '开始取货'
  if (status === '取货中') return '开始配送'
  if (status === '配送中') return '完成订单'
  return ''
}

function nextStatus(status) {
  if (status === '待接单') return '已接单'
  if (status === '已接单') return '取货中'
  if (status === '取货中') return '配送中'
  if (status === '配送中') return '已完成'
  return status
}

function normalizeOrder(order) {
  return {
    ...order,
    displayItems: order.buyItems || order.item || '待确认物品',
    sourceName: order.pickupName || order.purchaseAddressName || '取货地址',
    sourceDetail: order.pickupDetail || order.purchaseAddressDetail || '',
    sourcePin: order.service === '帮取' ? '取' : '发',
    actionText: actionLabel(order.status)
  }
}

async function login() {
  const apiBase = $('#apiBase').value.trim() || DEFAULT_API_BASE
  state.apiBase = apiBase.replace(/\/$/, '')
  localStorage.setItem('merchantApiBase', state.apiBase)
  const session = await api('/auth/merchant-login', {
    method: 'POST',
    body: { merchantId: state.operatorId }
  })
  state.token = session.token
  state.store = session.merchant
  state.operatorId = session.merchant.id
  localStorage.setItem('merchantToken', state.token)
  localStorage.setItem('merchantId', state.operatorId)
  toast('运营登录成功')
  await loadDashboard()
}

async function loadDashboard({ silent = false } = {}) {
  if (state.refreshing) return
  if (!state.token) {
    await login()
    return
  }
  state.refreshing = true
  try {
    const dashboard = await api(`/merchant/all-orders?merchantId=${encodeURIComponent(state.operatorId)}`)
    state.store = dashboard.store
    state.orders = (dashboard.orders || []).map(normalizeOrder)
    renderStore()
    renderStats(dashboard.stats || calcStats(state.orders))
    renderFilters()
    renderOrders()
    setHealth(true, '运营后台已和用户端订单状态同步')
    if (!silent) toast('订单已刷新')
  } finally {
    state.refreshing = false
  }
}

function calcStats(orders) {
  return {
    pending: orders.filter((item) => item.status === '待接单').length,
    preparing: orders.filter((item) => item.status === '已接单').length,
    ready: orders.filter((item) => item.status === '取货中').length,
    delivering: orders.filter((item) => item.status === '配送中').length,
    todayOrders: orders.length,
    revenue: orders.reduce((sum, item) => sum + Number(item.fee || 0), 0).toFixed(1)
  }
}

function renderStore() {
  const store = state.store || {}
  $('#storeCategory').textContent = store.category || '自营配送'
  $('#storeName').textContent = store.name || '同城速送运营中心'
  $('#storeAddress').textContent = `${store.address || '宁德市运营中心'} · 状态 ${store.status || '营业中'}`
  const status = $('#storeStatus')
  status.textContent = store.status || '营业中'
  status.classList.toggle('online', (store.status || '营业中') === '营业中')
}

function renderStats(stats) {
  $('#statPendingLabel').textContent = '待接单'
  $('#statPreparingLabel').textContent = '已接单'
  $('#statReadyLabel').textContent = '取/送中'
  $('#statRevenueLabel').textContent = '金额合计'
  $('#statPending').textContent = stats.pending || 0
  $('#statPreparing').textContent = stats.preparing || 0
  $('#statReady').textContent = Number(stats.ready || 0) + Number(stats.delivering || 0)
  $('#statToday').textContent = stats.todayOrders || 0
  $('#statRevenue').textContent = `￥${stats.revenue || '0.0'}`
}

function renderFilters() {
  if (!orderFilters.includes(state.activeFilter)) state.activeFilter = '全部'
  $('#filters').innerHTML = orderFilters.map((item) => `
    <button class="filter-btn ${state.activeFilter === item ? 'active' : ''}" type="button" data-filter="${item}">${item}</button>
  `).join('')
}

function statusClass(status) {
  if (status === '待接单') return 'hot'
  if (status === '取货中' || status === '配送中') return 'ready'
  if (status === '已完成') return 'done'
  return ''
}

function passFilter(order) {
  if (state.activeFilter === '全部') return true
  return order.status === state.activeFilter
}

function renderOrders() {
  const orders = state.orders.filter(passFilter)
  if (!orders.length) {
    $('#orders').innerHTML = '<div class="empty">当前筛选下暂无订单。用户端下单后会同步到这里。</div>'
    return
  }
  $('#orders').innerHTML = orders.map((order) => `
    <article class="order-card" data-id="${order.id}">
      <div class="order-head">
        <div>
          <div class="order-id">${order.id}</div>
          <div class="order-meta">${order.createTime || '-'} · ${order.service || '-'} · ${order.distance || 0}km · ${order.eta || '-'}</div>
        </div>
        <div class="status-stack">
          <span class="service-tag">${order.service || '-'}</span>
          <span class="order-status ${statusClass(order.status)}">${order.status || '-'}</span>
        </div>
      </div>
      <div class="status-row">
        <span>用户端状态：<strong>${order.status || '-'}</strong></span>
        <span>运营操作：<strong>${order.actionText || '无需操作'}</strong></span>
      </div>
      <div class="goods-box">
        <div class="goods-title">${escapeHtml(order.displayItems)}</div>
        <div class="goods-meta">${escapeHtml(order.vehicleName || '配送单')} · ${escapeHtml(order.weightLabel || '物品重量待确认')} · 合计 ￥${order.fee || 0}</div>
        ${order.remark ? `<div class="goods-note">备注：${escapeHtml(order.remark)}</div>` : ''}
      </div>
      <div class="route-line">
        <span class="pin buy">${order.sourcePin}</span>
        <div class="route-main"><strong>${escapeHtml(order.sourceName)}</strong><span>${escapeHtml(order.sourceDetail)}</span></div>
      </div>
      <div class="route-line">
        <span class="pin send">收</span>
        <div class="route-main"><strong>${escapeHtml(order.dropoffName || '')}</strong><span>${escapeHtml(order.dropoffDetail || '')}</span></div>
      </div>
      <div class="order-bottom">
        <button class="light-btn" type="button" data-ticket="${order.id}">打印小票</button>
        <button class="action-btn" type="button" data-action="${order.id}" ${order.actionText ? '' : 'disabled'}>${order.actionText || '已同步'}</button>
      </div>
    </article>
  `).join('')
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]))
}

function setHealth(connected, text) {
  $('.health-card').classList.toggle('connected', connected)
  $('#healthTitle').textContent = connected ? '后端已连接' : '连接失败'
  $('#healthText').textContent = text
}

async function advanceOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId)
  if (!order || !order.actionText) return
  const status = nextStatus(order.status)
  try {
    await api(`/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: { status, note: `运营后台更新为${status}` }
    })
    toast(`已更新为${status}，用户端同步更新`)
    await loadDashboard({ silent: true })
  } catch (error) {
    toast(`操作失败：${error.message}`)
  }
}

function bindEvents() {
  $('#apiBase').value = state.apiBase
  $('#loginBtn').addEventListener('click', () => login().catch((error) => {
    setHealth(false, error.message)
    toast(`登录失败：${error.message}`)
  }))
  $('#refreshBtn').addEventListener('click', () => loadDashboard().catch((error) => {
    setHealth(false, error.message)
    toast(`刷新失败：${error.message}`)
  }))
  $('#filters').addEventListener('click', (event) => {
    const filter = event.target.dataset.filter
    if (!filter) return
    state.activeFilter = filter
    renderFilters()
    renderOrders()
  })
  $('#orders').addEventListener('click', (event) => {
    const actionId = event.target.dataset.action
    const ticketId = event.target.dataset.ticket
    if (actionId) advanceOrder(actionId)
    if (ticketId) toast('已模拟打印小票')
  })
  document.querySelectorAll('[data-toast]').forEach((item) => {
    item.addEventListener('click', () => toast(item.dataset.toast))
  })
}

bindEvents()
renderFilters()
setHealth(false, '请先启动后端：python3 server/app.py --host 127.0.0.1 --port 8000')
if (state.token) {
  loadDashboard({ silent: true }).catch((error) => {
    setHealth(false, error.message)
    toast(`自动连接失败：${error.message}`)
  })
}
window.setInterval(() => {
  if (state.token) loadDashboard({ silent: true }).catch(() => {})
}, 8000)
