import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  calcStats,
  DEFAULT_API_BASE,
  DEFAULT_OPERATOR_ID,
  nextStatus,
  normalizeDashboard,
  OperationsApi,
  statusClass
} from './api'
import type { Order, RiderApplication, Stats, Store } from './types'

const orderFilters = ['全部', '待商家报价', '待确认报价', '待支付', '待接单', '已接单', '进行中', '已完成', '已取消']

function getInitialApiBase() {
  const saved = localStorage.getItem('merchantApiBase')
  if (!saved || saved === 'http://127.0.0.1:8000/api') return DEFAULT_API_BASE
  return saved
}

function getInitialToken() {
  const saved = localStorage.getItem('merchantToken') || ''
  if (saved.startsWith('mock-token:')) {
    localStorage.removeItem('merchantToken')
    return ''
  }
  return saved
}

function Toast({ message }: { message: string }) {
  return <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">{message}</div>
}

function LoginDialog({
  open,
  username,
  password,
  loading,
  onUsername,
  onPassword,
  onSubmit,
  onClose
}: {
  open: boolean
  username: string
  password: string
  loading: boolean
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="login-overlay" role="presentation">
      <form className="login-dialog" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <div className="login-heading">
          <div className="login-symbol">速</div>
          <div><strong>运营账号登录</strong><span>登录后处理报价和配送订单</span></div>
        </div>
        <label className="login-field">
          <span>账号</span>
          <input autoComplete="username" value={username} onChange={(event) => onUsername(event.target.value)} placeholder="请输入运营账号" />
        </label>
        <label className="login-field">
          <span>密码</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder="请输入登录密码" />
        </label>
        <button className="login-submit" type="submit" disabled={loading || !username || password.length < 6}>
          {loading ? '正在登录...' : '登录运营后台'}
        </button>
        <button className="login-cancel" type="button" onClick={onClose}>暂不登录</button>
      </form>
    </div>
  )
}

function Sidebar({ onTodo }: { onTodo: (message: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">速</div>
        <div>
          <div className="brand-name">同城速送</div>
          <div className="brand-sub">运营管理台</div>
        </div>
      </div>
      <nav className="nav-list" aria-label="运营后台导航">
        <button className="nav-item active" type="button"><span>01</span>订单调度</button>
        <button className="nav-item" type="button" onClick={() => onTodo('价格规则下一步接入')}><span>02</span>价格规则</button>
        <button className="nav-item" type="button" onClick={() => onTodo('服务范围下一步接入')}><span>03</span>服务范围</button>
        <button className="nav-item" type="button" onClick={() => onTodo('系统设置下一步接入')}><span>04</span>系统设置</button>
      </nav>
      <div className="sidebar-note">
        <span>标准履约流程</span>
        <strong>接单 → 上门/取货 → 服务/配送 → 完成</strong>
      </div>
    </aside>
  )
}

function StorePanel({ store, connected, healthText }: { store: Store | null; connected: boolean; healthText: string }) {
  const current = store || {
    category: '自营配送',
    name: '同城速送运营中心',
    address: '宁德市运营中心',
    status: connected ? '营业中' : '未登录'
  }
  return (
    <section className="store-panel">
      <div className="store-card">
        <div className="store-identity">
          <div className="store-symbol">配</div>
          <div>
            <div className="store-kicker">{current.category}</div>
            <h2>{current.name}</h2>
            <p>{current.address}</p>
          </div>
        </div>
        <div className={`status-pill ${current.status === '营业中' ? 'online' : ''}`}>{current.status}</div>
      </div>
      <div className={`health-card ${connected ? 'connected' : ''}`}>
        <span className="pulse" />
        <div>
          <strong>{connected ? '后端已连接' : '等待连接'}</strong>
          <p>{healthText}</p>
        </div>
      </div>
    </section>
  )
}

function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <section className="stats-grid" aria-label="今日概览">
      <article className="stat-card hot"><span>待接单</span><strong>{stats.pending}</strong></article>
      <article className="stat-card"><span>已接单</span><strong>{stats.preparing}</strong></article>
      <article className="stat-card"><span>服务中</span><strong>{Number(stats.ready) + Number(stats.delivering)}</strong></article>
      <article className="stat-card"><span>今日订单</span><strong>{stats.todayOrders}</strong></article>
      <article className="stat-card"><span>金额合计</span><strong>￥{stats.revenue}</strong></article>
    </section>
  )
}

function RiderReviewPanel({ riders, onReview }: { riders: RiderApplication[]; onReview: (rider: RiderApplication, approved: boolean) => void }) {
  if (!riders.length) return null
  return (
    <section className="rider-review-panel">
      <div className="rider-review-head"><div><h2>骑手审核</h2><p className="muted">审核车型、搬运资格和服务范围后，骑手才能上线抢单。</p></div><span>{riders.length} 人待处理</span></div>
      <div className="rider-review-grid">
        {riders.map((rider) => (
          <article className="rider-review-card" key={rider.id}>
            <div><strong>{rider.name}</strong><p>{rider.phone || '未填写手机号'}</p></div>
            <div className="rider-request">{rider.application?.requestedVehicleName || rider.application?.requestedVehicleType || '未选择车型'} · {rider.application?.requestsHandling ? '申请搬运资格' : '普通履约'}</div>
            <div className="rider-actions"><button type="button" onClick={() => onReview(rider, false)}>拒绝</button><button className="approve" type="button" onClick={() => onReview(rider, true)}>审核通过</button></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function OrderCard({
  order,
  onAdvance,
  onQuote,
  onTicket
}: {
  order: Order
  onAdvance: (id: string) => void
  onQuote: (id: string, quotedFee: number, quoteNote: string) => Promise<void>
  onTicket: () => void
}) {
  const isCompleted = order.status === '已完成'
  const isCancelled = order.status === '已取消'
  const isTerminal = isCompleted || isCancelled
  const isWaitingPayment = !isTerminal && !order.isPaid
  const [quoteValue, setQuoteValue] = useState(order.quotedFee ? String(order.quotedFee) : '')
  const [quoteNote, setQuoteNote] = useState(order.quoteNote || '')
  const [isQuoting, setIsQuoting] = useState(false)

  const submitQuote = async () => {
    const quotedFee = Number(quoteValue)
    if (!Number.isFinite(quotedFee) || quotedFee <= 0) return
    setIsQuoting(true)
    try {
      await onQuote(order.id, quotedFee, quoteNote)
    } catch {
      // Toast is handled by the parent callback.
    } finally {
      setIsQuoting(false)
    }
  }

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <div className="order-id">{order.id}</div>
          <div className="order-meta">{order.createTime} · {order.service} · {order.distance}km · {order.eta}</div>
        </div>
        <div className="status-stack">
          <span className="service-tag">{order.service}</span>
          <span className={`order-status ${statusClass(order.displayStatus)}`}>{order.displayStatus}</span>
        </div>
      </div>
      <div className="status-row">
        <span>用户端状态：<strong>{order.displayStatus}</strong></span>
        <span>运营操作：<strong>{isWaitingPayment && !order.needsQuote && !order.awaitingQuoteConfirmation ? '等待用户支付' : order.needsQuote ? (order.quoteStatus === 'REJECTED' ? '重新报价' : '填写报价') : order.awaitingQuoteConfirmation ? '等待用户确认' : (order.actionText || '无需操作')}</strong></span>
      </div>
      <div className="order-content">
        <div className="order-info">
          <div className="goods-box">
            <div className="goods-title">{order.displayItems}</div>
            <div className="goods-meta">
              {order.service === '帮买'
                ? `商品 ￥${order.productFee || 0} · 配送 ￥${order.deliveryFee || 0} · 合计 ${order.feeText}`
                : order.isManualQuote
                  ? `${order.vehicleName} · 规则预估 ￥${order.estimatedFee || 0} · 当前 ${order.feeText}`
                  : `${order.vehicleName} · ${order.weightLabel} · 合计 ${order.feeText}`}
            </div>
            {order.remark ? <div className="goods-note">备注：{order.remark}</div> : null}
            {order.quoteStatus !== 'PENDING' && order.quoteNote ? <div className="goods-note">报价说明：{order.quoteNote}</div> : null}
          </div>
          {order.needsQuote ? (
            <div className="quote-box">
              <div>
                <strong>{order.quoteStatus === 'REJECTED' ? '用户已拒绝，请重新报价' : '填写商家最终报价'}</strong>
                <span>系统预估 ￥{order.estimatedFee || 0}，最终报价需由用户确认后才能履约。</span>
              </div>
              <label className="quote-input">
                <span>￥</span>
                <input
                  inputMode="decimal"
                  placeholder="输入报价"
                  value={quoteValue}
                  onChange={(event) => setQuoteValue(event.target.value)}
                />
              </label>
              <input
                className="quote-note"
                placeholder="报价说明，可选"
                value={quoteNote}
                onChange={(event) => setQuoteNote(event.target.value)}
              />
              <button className="quote-btn" type="button" disabled={isQuoting || Number(quoteValue) <= 0} onClick={submitQuote}>
                {isQuoting ? '提交中' : '确认报价'}
              </button>
            </div>
          ) : null}
          {order.awaitingQuoteConfirmation ? (
            <div className="quote-state waiting">
              <div><strong>等待用户确认报价</strong><span>最终报价 ￥{order.quotedFee || order.fee}，确认前订单不能进入履约。</span></div>
            </div>
          ) : null}
          {order.quoteAccepted ? (
            <div className="quote-state accepted">
              <div><strong>用户已接受报价</strong><span>最终价格 ￥{order.quotedFee || order.fee}，{order.isPaid ? '可以继续处理订单。' : '等待用户完成支付。'}</span></div>
            </div>
          ) : null}
        </div>
        <div className="route-stack" aria-label="取送路线">
          <div className="route-line">
            <span className="pin buy">{order.sourcePin}</span>
            <div className="route-main"><strong>{order.sourceName}</strong><span>{order.sourceDetail}</span></div>
          </div>
          <div className="route-line">
            <span className="pin send">收</span>
            <div className="route-main"><strong>{order.dropoffName || ''}</strong><span>{order.dropoffDetail || ''}</span></div>
          </div>
        </div>
      </div>
      <div className="order-bottom">
        <button className="light-btn" type="button" onClick={onTicket}>打印小票</button>
        <button
          className={`action-btn ${isTerminal ? 'terminal-action' : ''} ${isCancelled ? 'cancelled' : ''} ${!isTerminal && (order.needsQuote || order.awaitingQuoteConfirmation || isWaitingPayment) ? 'pending-action' : ''}`}
          type="button"
          disabled={isTerminal || !order.actionText}
          onClick={() => onAdvance(order.id)}
        >
          {isCompleted
            ? '已完成'
            : isCancelled
              ? '已取消'
              : order.actionText || (isWaitingPayment && !order.needsQuote && !order.awaitingQuoteConfirmation ? '待支付' : order.awaitingQuoteConfirmation ? '待确认报价' : '待商家报价')}
        </button>
      </div>
    </article>
  )
}

function OrdersWorkspace({
  filter,
  orders,
  onFilter,
  onAdvance,
  onQuote,
  onTicket
}: {
  filter: string
  orders: Order[]
  onFilter: (filter: string) => void
  onAdvance: (id: string) => void
  onQuote: (id: string, quotedFee: number, quoteNote: string) => Promise<void>
  onTicket: () => void
}) {
  const filteredOrders = orders.filter((order) => {
    if (filter === '全部') return true
    if (filter === '进行中') return order.status === '取货中' || order.status === '配送中'
    return order.displayStatus === filter
  })
  return (
    <section className="workspace">
      <div className="toolbar">
        <div>
          <h2>实时订单</h2>
          <p className="muted">按状态筛选订单，处理报价与履约进度。</p>
        </div>
        <div className="toolbar-actions">
          <div className="filters">
            {orderFilters.map((item) => (
              <button key={item} className={`filter-btn ${filter === item ? 'active' : ''}`} type="button" onClick={() => onFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="orders">
        {filteredOrders.length ? filteredOrders.map((order) => (
          <OrderCard key={order.id} order={order} onAdvance={onAdvance} onQuote={onQuote} onTicket={onTicket} />
        )) : <div className="empty">当前筛选下暂无订单。用户端下单后会同步到这里。</div>}
      </div>
    </section>
  )
}

export function OperationsApp() {
  const [apiBase, setApiBase] = useState(getInitialApiBase)
  const [token, setToken] = useState(getInitialToken)
  const [operatorId, setOperatorId] = useState(() => localStorage.getItem('merchantId') || DEFAULT_OPERATOR_ID)
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('merchantName') || '')
  const [username, setUsername] = useState(() => localStorage.getItem('merchantUsername') || 'operator-demo')
  const [password, setPassword] = useState('')
  const [showLogin, setShowLogin] = useState(() => !getInitialToken())
  const [loggingIn, setLoggingIn] = useState(false)
  const [filter, setFilter] = useState('全部')
  const [orders, setOrders] = useState<Order[]>([])
  const [riders, setRiders] = useState<RiderApplication[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [connected, setConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState('')
  const [healthText, setHealthText] = useState('请先启动 NestJS 后端：cd server/api && npm run start:dev')
  const toastTimer = useRef(0)
  const refreshingRef = useRef(false)

  const api = useMemo(() => new OperationsApi(apiBase.replace(/\/$/, ''), token), [apiBase, token])
  const stats = useMemo(() => calcStats(orders), [orders])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }, [])

  const loadDashboard = useCallback(async (silent = false) => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      const [payload, riderApplications] = await Promise.all([api.listOrders(), api.listRiderApplications()])
      const dashboard = normalizeDashboard(payload, operatorId)
      setStore(dashboard.store)
      setOrders(dashboard.orders)
      setRiders(riderApplications)
      setConnected(true)
      setHealthText('已连接 NestJS 后端，订单状态会和用户端同步')
      if (!silent) showToast('订单已刷新')
    } catch (error) {
      setConnected(false)
      setHealthText(error instanceof Error ? error.message : '后端连接失败')
      if (error instanceof Error && error.message.includes('登录')) setShowLogin(true)
      if (!silent) showToast(`刷新失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [api, operatorId, showToast])

  const login = useCallback(async () => {
    const cleanBase = apiBase.replace(/\/$/, '') || DEFAULT_API_BASE
    setApiBase(cleanBase)
    localStorage.setItem('merchantApiBase', cleanBase)
    setLoggingIn(true)
    try {
      const session = await api.login(username.trim(), password)
      const nextToken = session.token
      const nextOperatorId = session.operator?.id || operatorId
      const nextOperatorName = session.operator?.name || username
      setToken(nextToken)
      setOperatorId(nextOperatorId)
      setOperatorName(nextOperatorName)
      localStorage.setItem('merchantToken', nextToken)
      localStorage.setItem('merchantId', nextOperatorId)
      localStorage.setItem('merchantName', nextOperatorName)
      localStorage.setItem('merchantUsername', username.trim())
      setPassword('')
      setShowLogin(false)
      showToast('运营登录成功')
      const sessionApi = new OperationsApi(cleanBase, nextToken)
      const [payload, riderApplications] = await Promise.all([sessionApi.listOrders(), sessionApi.listRiderApplications()])
      const dashboard = normalizeDashboard(payload, nextOperatorId)
      setStore(dashboard.store)
      setOrders(dashboard.orders)
      setRiders(riderApplications)
      setConnected(true)
      setHealthText('已连接 NestJS 后端，订单状态会和用户端同步')
    } catch (error) {
      setConnected(false)
      const message = error instanceof Error ? error.message : '未知错误'
      setHealthText(message)
      showToast(`登录失败：${message}`)
    } finally {
      setLoggingIn(false)
    }
  }, [api, apiBase, operatorId, password, showToast, username])

  const logout = useCallback(() => {
    setToken('')
    setOperatorName('')
    setOrders([])
    setRiders([])
    setStore(null)
    setConnected(false)
    localStorage.removeItem('merchantToken')
    localStorage.removeItem('merchantId')
    localStorage.removeItem('merchantName')
    setHealthText('请登录运营账号')
    setShowLogin(true)
  }, [])

  const advanceOrder = useCallback(async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId)
    if (!order || !order.actionText) return
    const targetStatus = nextStatus(order.status)
    try {
      await api.updateOrderStatus(order.id, targetStatus)
      showToast(`已更新为${targetStatus}，用户端同步更新`)
      await loadDashboard(true)
    } catch (error) {
      showToast(`操作失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [api, loadDashboard, orders, showToast])

  const quoteOrder = useCallback(async (orderId: string, quotedFee: number, quoteNote: string) => {
    try {
      await api.quoteOrder(orderId, quotedFee, quoteNote)
      showToast(`已报价 ￥${quotedFee}，等待用户确认`)
      await loadDashboard(true)
    } catch (error) {
      showToast(`报价失败：${error instanceof Error ? error.message : '未知错误'}`)
      throw error
    }
  }, [api, loadDashboard, showToast])

  const reviewRider = useCallback(async (rider: RiderApplication, approved: boolean) => {
    try {
      await api.reviewRider(rider, approved)
      showToast(approved ? '骑手已审核通过' : '骑手申请已拒绝')
      await loadDashboard(true)
    } catch (error) {
      showToast(`审核失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [api, loadDashboard, showToast])

  useEffect(() => {
    if (!token) return undefined
    loadDashboard(true)
    const timer = window.setInterval(() => loadDashboard(true), 5000)
    return () => window.clearInterval(timer)
  }, [loadDashboard, token])

  return (
    <div className="shell">
      <Sidebar onTodo={showToast} />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">今日运营</p>
            <h1>订单调度中心</h1>
            <p className="muted">集中处理用户订单、最终报价与配送进度。</p>
          </div>
          <div className="top-actions">
            <label className="api-field">
              <span>服务地址</span>
              <input value={apiBase} aria-label="API 地址" onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <button className="ghost-btn" type="button" onClick={token ? logout : () => setShowLogin(true)}>{token ? `${operatorName || '运营员'} · 退出` : '登录'}</button>
            <button className="primary-btn" type="button" onClick={() => loadDashboard(false)} disabled={refreshing}>
              {refreshing ? '刷新中' : '刷新'}
            </button>
          </div>
        </header>

        <StorePanel store={store} connected={connected} healthText={healthText} />
        <StatsGrid stats={stats} />
        <RiderReviewPanel riders={riders} onReview={reviewRider} />
        <OrdersWorkspace
          filter={filter}
          orders={orders}
          onFilter={setFilter}
          onAdvance={advanceOrder}
          onQuote={quoteOrder}
          onTicket={() => showToast('已模拟打印小票')}
        />
      </main>
      <Toast message={toast} />
      <LoginDialog
        open={showLogin}
        username={username}
        password={password}
        loading={loggingIn}
        onUsername={setUsername}
        onPassword={setPassword}
        onSubmit={login}
        onClose={() => setShowLogin(false)}
      />
    </div>
  )
}

OperationsApp.displayName = 'OperationsApp'
