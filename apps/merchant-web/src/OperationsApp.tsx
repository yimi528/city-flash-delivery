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
import type { Order, Stats, Store } from './types'

const orderFilters = ['全部', '待接单', '已接单', '取货中', '配送中', '已完成', '已取消']

function getInitialApiBase() {
  const saved = localStorage.getItem('merchantApiBase')
  if (!saved || saved === 'http://127.0.0.1:8000/api') return DEFAULT_API_BASE
  return saved
}

function Toast({ message }: { message: string }) {
  return <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">{message}</div>
}

function Sidebar({ onTodo }: { onTodo: (message: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">速</div>
      <div>
        <div className="brand-name">同城速送</div>
        <div className="brand-sub">Operations Console</div>
      </div>
      <nav className="nav-list" aria-label="运营后台导航">
        <button className="nav-item active" type="button">订单工作台</button>
        <button className="nav-item" type="button" onClick={() => onTodo('价格规则下一步接入')}>价格规则</button>
        <button className="nav-item" type="button" onClick={() => onTodo('服务范围下一步接入')}>服务范围</button>
        <button className="nav-item" type="button" onClick={() => onTodo('系统设置下一步接入')}>系统设置</button>
      </nav>
      <div className="sidebar-note">
        <span>固定配送流</span>
        <strong>接单 → 取货 → 配送 → 完成</strong>
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
        <div>
          <div className="store-kicker">{current.category}</div>
          <h2>{current.name}</h2>
          <p>{current.address} · 状态 {current.status}</p>
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
      <article className="stat-card"><span>取/送中</span><strong>{Number(stats.ready) + Number(stats.delivering)}</strong></article>
      <article className="stat-card"><span>今日订单</span><strong>{stats.todayOrders}</strong></article>
      <article className="stat-card"><span>金额合计</span><strong>￥{stats.revenue}</strong></article>
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
          <span className={`order-status ${statusClass(order.status)}`}>{order.status}</span>
        </div>
      </div>
      <div className="status-row">
        <span>用户端状态：<strong>{order.status}</strong></span>
        <span>运营操作：<strong>{order.needsQuote ? '填写报价' : (order.actionText || '无需操作')}</strong></span>
      </div>
      <div className="goods-box">
        <div className="goods-title">{order.displayItems}</div>
        <div className="goods-meta">
          {order.service === '帮买'
            ? `商品 ￥${order.productFee || 0} · 配送 ￥${order.deliveryFee || 0} · 合计 ${order.feeText}`
            : `${order.vehicleName} · ${order.weightLabel} · 合计 ${order.feeText}`}
        </div>
        {order.remark ? <div className="goods-note">备注：{order.remark}</div> : null}
        {order.quoteStatus === 'QUOTED' && order.quoteNote ? <div className="goods-note">报价说明：{order.quoteNote}</div> : null}
      </div>
      {order.needsQuote ? (
        <div className="quote-box">
          <div>
            <strong>待报价</strong>
            <span>搬家/装货/卸货类订单需要运营先确认价格。</span>
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
      <div className="route-line">
        <span className="pin buy">{order.sourcePin}</span>
        <div className="route-main"><strong>{order.sourceName}</strong><span>{order.sourceDetail}</span></div>
      </div>
      <div className="route-line">
        <span className="pin send">收</span>
        <div className="route-main"><strong>{order.dropoffName || ''}</strong><span>{order.dropoffDetail || ''}</span></div>
      </div>
      <div className="order-bottom">
        <button className="light-btn" type="button" onClick={onTicket}>打印小票</button>
        <button className="action-btn" type="button" disabled={!order.actionText} onClick={() => onAdvance(order.id)}>
          {order.actionText || '已同步'}
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
  const filteredOrders = orders.filter((order) => filter === '全部' || order.status === filter)
  return (
    <section className="workspace">
      <div className="toolbar">
        <div>
          <h2>订单列表</h2>
          <p className="muted">React 运营 Web，默认连接 NestJS 后端，处理帮送、帮取、送货订单。</p>
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
  const [token, setToken] = useState(() => localStorage.getItem('merchantToken') || '')
  const [operatorId, setOperatorId] = useState(() => localStorage.getItem('merchantId') || DEFAULT_OPERATOR_ID)
  const [filter, setFilter] = useState('全部')
  const [orders, setOrders] = useState<Order[]>([])
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
      const payload = await api.listOrders()
      const dashboard = normalizeDashboard(payload, operatorId)
      setStore(dashboard.store)
      setOrders(dashboard.orders)
      setConnected(true)
      setHealthText('已连接 NestJS 后端，订单状态会和用户端同步')
      if (!silent) showToast('订单已刷新')
    } catch (error) {
      setConnected(false)
      setHealthText(error instanceof Error ? error.message : '后端连接失败')
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
    try {
      const session = await api.login(operatorId)
      const nextToken = session.token
      const nextOperatorId = session.operator?.id || operatorId
      setToken(nextToken)
      setOperatorId(nextOperatorId)
      localStorage.setItem('merchantToken', nextToken)
      localStorage.setItem('merchantId', nextOperatorId)
      showToast('运营登录成功')
      await loadDashboard(false)
    } catch (error) {
      setConnected(false)
      const message = error instanceof Error ? error.message : '未知错误'
      setHealthText(message)
      showToast(`登录失败：${message}`)
    }
  }, [api, apiBase, loadDashboard, operatorId, showToast])

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
      showToast(`已报价 ￥${quotedFee}，用户端会自动同步`)
      await loadDashboard(true)
    } catch (error) {
      showToast(`报价失败：${error instanceof Error ? error.message : '未知错误'}`)
      throw error
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
            <p className="eyebrow">运营后台 React Web</p>
            <h1>同城配送订单工作台</h1>
            <p className="muted">甲方单运营方使用：查看全部用户订单，并按固定配送流程更新状态。</p>
          </div>
          <div className="top-actions">
            <label className="api-field">
              <span>API</span>
              <input value={apiBase} aria-label="API 地址" onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <button className="ghost-btn" type="button" onClick={login}>运营登录</button>
            <button className="primary-btn" type="button" onClick={() => loadDashboard(false)} disabled={refreshing}>
              {refreshing ? '刷新中' : '刷新订单'}
            </button>
          </div>
        </header>

        <StorePanel store={store} connected={connected} healthText={healthText} />
        <StatsGrid stats={stats} />
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
    </div>
  )
}

OperationsApp.displayName = 'OperationsApp'
