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
import { PricingWorkspace, ServiceAreasWorkspace, SystemSettingsWorkspace } from './ConfigWorkspaces'
import { NewOrderAlert } from './newOrderAlert'

const orderFilters = ['全部', '待商家接单', '待骑手接单', '待商家报价', '待确认报价', '待支付', '进行中', '已完成', '已取消']
const PAGE_SIZE = 5

type OperatorSession = {
  token: string
  operator?: { id?: string; username?: string; name?: string }
}

function dateValue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function inDateRange(value: string | undefined, start: string, end: string) {
  const date = dateValue(value)
  return (!start || date >= start) && (!end || date <= end)
}

function Pagination({ page, total, pageSize = PAGE_SIZE, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <nav className="pagination" aria-label="分页">
      <span>共 {total} 条 · 第 {page}/{pages} 页</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </nav>
  )
}

function ResultState({ kind, message }: { kind: 'loading' | 'error' | 'permission' | 'empty'; message: string }) {
  return <div className={`result-state ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><strong>{kind === 'loading' ? '正在加载' : kind === 'error' ? '加载失败' : kind === 'permission' ? '暂无权限' : '没有找到结果'}</strong><span>{message}</span></div>
}

function getInitialApiBase() {
  const saved = localStorage.getItem('merchantApiBase')
  return saved || DEFAULT_API_BASE
}

function getInitialToken() {
  const saved = sessionStorage.getItem('merchantToken') || ''
  if (saved.startsWith('mock-token:')) {
    sessionStorage.removeItem('merchantToken')
    return ''
  }
  return saved
}

function Toast({ message }: { message: string }) {
  return <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">{message}</div>
}

const DEMO_OPERATOR_USERNAME = 'operator-demo'
const DEMO_OPERATOR_PASSWORD = 'DevOperator!2026'

function LoginDialog({
  open,
  loading,
  onLogin,
  onClose
}: {
  open: boolean
  loading: boolean
  onLogin: (username: string, password: string) => void
  onClose: () => void
}) {
  const [username, setUsername] = useState(() => import.meta.env.DEV ? DEMO_OPERATOR_USERNAME : localStorage.getItem('merchantUsername') || '')
  const [password, setPassword] = useState(() => import.meta.env.DEV ? DEMO_OPERATOR_PASSWORD : '')
  if (!open) return null
  return (
    <div className="login-overlay" role="presentation">
      <form className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="operator-login-title" onSubmit={(event) => {
        event.preventDefault()
        onLogin(username.trim(), password)
      }}>
        <div className="login-heading">
          <div className="login-symbol">盾</div>
          <div><strong id="operator-login-title">商家安全登录</strong><span>使用运营账号与强密码登录</span></div>
        </div>
        <label className="login-field">
          <span>用户名</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required placeholder="请输入运营账号" />
        </label>
        <label className="login-field">
          <span>强密码</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="请输入登录密码" />
        </label>
        <p className="login-security-note">密码至少 12 位，并包含大小写字母、数字和特殊字符。连续失败 5 次，账号将锁定 15 分钟。</p>
        <button className="login-submit" type="submit" disabled={loading || !username.trim() || !password}>
          {loading ? '正在安全验证…' : '登录商家后台'}
        </button>
        <button className="login-cancel" type="button" onClick={onClose}>暂不登录</button>
      </form>
    </div>
  )
}

function Sidebar({ activeView, pendingRiderCount, onNavigate }: { activeView: string; pendingRiderCount: number; onNavigate: (view: string) => void }) {
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
        <button className={`nav-item ${activeView === 'orders' ? 'active' : ''}`} type="button" onClick={() => onNavigate('orders')}><span>01</span>订单调度</button>
        <button className={`nav-item ${activeView === 'pricing' ? 'active' : ''}`} type="button" onClick={() => onNavigate('pricing')}><span>02</span>价格规则</button>
        <button className={`nav-item ${activeView === 'service-areas' ? 'active' : ''}`} type="button" onClick={() => onNavigate('service-areas')}><span>03</span>服务范围</button>
        <button className={`nav-item ${activeView === 'rider-applications' ? 'active' : ''}`} type="button" onClick={() => onNavigate('rider-applications')}><span>04</span><span className="nav-label">骑手申请{pendingRiderCount > 0 ? <b className="nav-badge" key={pendingRiderCount} aria-label={`${pendingRiderCount} 条待审核申请`}>{pendingRiderCount > 99 ? '99+' : pendingRiderCount}</b> : null}</span></button>
        <button className={`nav-item ${activeView === 'riders' ? 'active' : ''}`} type="button" onClick={() => onNavigate('riders')}><span>05</span>骑手管理</button>
        <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} type="button" onClick={() => onNavigate('settings')}><span>06</span>系统设置</button>
      </nav>
      <div className="sidebar-note">
        <div className="sidebar-note-head">
          <span>履约节奏</span>
          <b>4 步</b>
        </div>
        <ol className="fulfillment-flow" aria-label="标准履约流程">
          <li className="flow-step"><span>01</span><strong>商家接单</strong></li>
          <li className="flow-step"><span>02</span><strong>骑手接单</strong></li>
          <li className="flow-step"><span>03</span><strong>上门服务</strong></li>
          <li className="flow-step"><span>04</span><strong>完成</strong></li>
        </ol>
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
      <article className="stat-card hot"><span>待商家接单</span><strong>{stats.pending}</strong></article>
      <article className="stat-card"><span>待骑手接单</span><strong>{stats.preparing}</strong></article>
      <article className="stat-card"><span>服务中</span><strong>{Number(stats.ready) + Number(stats.delivering)}</strong></article>
      <article className="stat-card"><span>今日订单</span><strong>{stats.todayOrders}</strong></article>
      <article className="stat-card"><span>金额合计</span><strong>￥{stats.revenue}</strong></article>
    </section>
  )
}

const RIDER_VEHICLE_LABELS: Record<string, string> = { EBIKE: '二轮车', ETRIKE: '货三轮车', VAN: '小车', MANUAL: '人力服务' }

function riderRequestedVehicles(rider: RiderApplication) {
  return rider.application?.requestedVehicleTypes?.map((type) => RIDER_VEHICLE_LABELS[type] || type).join('、') || rider.application?.requestedVehicleName || rider.application?.requestedVehicleType || '未选择车型'
}

function RiderApplicationsWorkspace({ riders, onReview }: { riders: RiderApplication[]; onReview: (rider: RiderApplication, approved: boolean) => void }) {
  const [filter, setFilter] = useState('ALL')
  const filtered = riders.filter((item) => filter === 'ALL' || (item.application?.applicationStatus || item.status) === filter)
  return (
    <section className="workspace rider-workspace">
      <div className="toolbar"><div><h2>骑手申请管理</h2><p className="muted">审核通过会在原用户账号上增加骑手身份；拒绝必须保留原因。</p></div><div className="rider-toolbar"><div className="rider-filters">{[['ALL', '全部'], ['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已拒绝']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div><span className="workspace-count">{riders.filter((item) => (item.application?.applicationStatus || item.status) === 'PENDING').length} 条待处理</span></div></div>
      <div className="rider-review-grid">
        {filtered.length ? filtered.map((rider) => {
          const applicationStatus = rider.application?.applicationStatus || rider.status
          const reviewed = applicationStatus !== 'PENDING'
          return <article className="rider-review-card" key={rider.application?.applicationId || rider.id}>
            <div className="rider-card-top"><div><strong>{rider.name}</strong><p>{rider.phone || '未填写手机号'} · 用户 {rider.userId || rider.application?.userId || '历史档案'}</p></div><span className={`rider-status ${String(applicationStatus).toLowerCase()}`}>{applicationStatus === 'PENDING' ? '审核中' : applicationStatus === 'APPROVED' ? '已通过' : applicationStatus === 'REJECTED' ? '已拒绝' : applicationStatus}</span></div>
            <div className="rider-request">{riderRequestedVehicles(rider)} · {rider.application?.requestsHandling ? '申请搬运资格' : '普通履约'}</div>
            <div className="rider-request-meta">提交 {rider.application?.submittedAt ? new Date(rider.application.submittedAt).toLocaleString() : '-'} {rider.application?.reviewedBy ? `· 审核人 ${rider.application.reviewedBy}` : ''}</div>
            {rider.application?.rejectionReason ? <div className="rider-reason">拒绝原因：{rider.application.rejectionReason}</div> : null}
            <div className="rider-actions">{reviewed ? <span className="muted">已完成审核，历史记录保留</span> : <><button type="button" onClick={() => onReview(rider, false)}>拒绝</button><button className="approve" type="button" onClick={() => onReview(rider, true)}>审核通过</button></>}</div>
          </article>
        }) : <div className="empty">暂无骑手申请。用户端提交后会同步到这里。</div>}
      </div>
    </section>
  )
}

function RidersWorkspace({ riders, loading, error, authorized, onChangeStatus }: { riders: RiderApplication[]; loading: boolean; error: string; authorized: boolean; onChangeStatus: (rider: RiderApplication, action: 'suspend' | 'restore' | 'resign') => void }) {
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [workFilter, setWorkFilter] = useState('ALL')
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [registeredStart, setRegisteredStart] = useState('')
  const [registeredEnd, setRegisteredEnd] = useState('')
  const [page, setPage] = useState(1)
  const regions = useMemo(() => Array.from(new Set(riders.map((rider) => rider.serviceCity).filter(Boolean) as string[])), [riders])
  const filtered = riders.filter((rider) => {
    const work = rider.workStatus || (rider.online ? 'ONLINE' : 'OFFLINE')
    const haystack = [rider.name, rider.phone, rider.id, rider.riderId].filter(Boolean).join(' ').toLowerCase()
    return (!query || haystack.includes(query.toLowerCase()))
      && (roleFilter === 'ALL' || rider.roleStatus === roleFilter)
      && (workFilter === 'ALL' || work === workFilter)
      && (regionFilter === 'ALL' || (rider.serviceCity || '未设置区域') === regionFilter)
      && inDateRange(rider.createdAt, registeredStart, registeredEnd)
  })
  const pagedRiders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasFilters = Boolean(query || roleFilter !== 'ALL' || workFilter !== 'ALL' || regionFilter !== 'ALL' || registeredStart || registeredEnd)
  const applySearch = () => { setQuery(draftQuery.trim()); setPage(1) }
  const clearSearch = () => {
    setDraftQuery(''); setQuery(''); setRoleFilter('ALL'); setWorkFilter('ALL'); setRegionFilter('ALL'); setRegisteredStart(''); setRegisteredEnd(''); setPage(1)
  }
  useEffect(() => setPage(1), [roleFilter, workFilter, regionFilter, registeredStart, registeredEnd])
  return (
    <section className="workspace rider-workspace">
      <div className="workspace-heading"><div><h2>骑手管理</h2><p className="muted">按姓名、手机号或骑手编号检索，查看状态与当前配送。</p></div><span className="result-count">{filtered.length} 名骑手</span></div>
      <div className="search-panel">
        <form className="search-row" onSubmit={(event) => { event.preventDefault(); applySearch() }}>
          <label className="search-input"><span aria-hidden="true">⌕</span><input value={draftQuery} onChange={(event) => { const value = event.target.value; setDraftQuery(value); setQuery(value.trim()); setPage(1) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applySearch() } }} placeholder="搜索骑手姓名、手机号或骑手编号" aria-label="搜索骑手" />{draftQuery ? <button type="button" aria-label="清除搜索词" onClick={() => { setDraftQuery(''); setQuery(''); setPage(1) }}>×</button> : null}</label>
          <button className="search-submit" type="submit">搜索</button>
          {hasFilters ? <button className="clear-filters" type="button" onClick={clearSearch}>清空条件</button> : null}
        </form>
        <div className="advanced-filters">
          <label><span>骑手状态</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">全部状态</option><option value="ACTIVE">在职</option><option value="SUSPENDED">已暂停</option><option value="RESIGNED">已离职</option></select></label>
          <label><span>工作状态</span><select value={workFilter} onChange={(event) => setWorkFilter(event.target.value)}><option value="ALL">全部工作状态</option><option value="ONLINE">在线</option><option value="DELIVERING">配送中</option><option value="OFFLINE">离线</option></select></label>
          <label><span>所属区域</span><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="ALL">全部区域</option>{regions.map((region) => <option value={region} key={region}>{region}</option>)}<option value="未设置区域">未设置区域</option></select></label>
          <label className="date-filter"><span>注册时间</span><div><input type="date" value={registeredStart} max={registeredEnd || undefined} onChange={(event) => setRegisteredStart(event.target.value)} aria-label="注册开始日期" /><b>至</b><input type="date" value={registeredEnd} min={registeredStart || undefined} onChange={(event) => setRegisteredEnd(event.target.value)} aria-label="注册结束日期" /></div></label>
        </div>
        {hasFilters ? <div className="filter-feedback" aria-live="polite"><span>当前筛选</span>{query ? <b>关键词：{query}</b> : null}{roleFilter !== 'ALL' ? <b>身份状态已筛选</b> : null}{workFilter !== 'ALL' ? <b>工作状态已筛选</b> : null}{regionFilter !== 'ALL' ? <b>区域：{regionFilter}</b> : null}{registeredStart || registeredEnd ? <b>注册时间：{registeredStart || '不限'} 至 {registeredEnd || '不限'}</b> : null}</div> : null}
        {loading && riders.length ? <div className="data-notice" role="status">正在更新骑手数据…</div> : error && riders.length ? <div className="data-notice error" role="alert">骑手数据更新失败：{error}，当前显示上次成功加载的结果。</div> : null}
      </div>
      <div className="rider-management-grid">
        {!authorized ? <ResultState kind="permission" message="请先登录运营账号后查看骑手档案。" /> : loading && !riders.length ? <ResultState kind="loading" message="正在读取骑手档案，请稍候。" /> : error && !riders.length ? <ResultState kind="error" message={error} /> : pagedRiders.length ? pagedRiders.map((rider) => {
          const status = rider.roleStatus || 'SUSPENDED'
          const work = rider.workStatus || (rider.online ? 'ONLINE' : 'OFFLINE')
          return <article className="rider-management-card" key={rider.id}>
            <div className="rider-card-top"><div><strong>{rider.name}</strong><p>{rider.phone || '未填写手机号'} · 编号 {rider.id}</p></div><span className={`rider-status ${String(status).toLowerCase()}`}>{status === 'ACTIVE' ? '在职' : status === 'SUSPENDED' ? '已暂停' : status === 'RESIGNED' ? '已离职' : status}</span></div>
            <div className="rider-card-detail"><span>{rider.serviceCity || '未设置区域'}</span><span>注册于 {rider.createdAt ? new Date(rider.createdAt).toLocaleDateString() : '历史档案'}</span></div>
            <div className="rider-metrics"><span><b>{work === 'ONLINE' ? '在线' : work === 'DELIVERING' ? '配送中' : work === 'PAUSED' ? '主动暂停' : '离线'}</b><small>工作状态</small></span><span><b>{rider.deliveryCount || 0}</b><small>已完成配送</small></span><span><b>{(rider.currentOrders || []).length}</b><small>当前订单</small></span></div>
            {(rider.currentOrders || []).length ? <div className="rider-current-order">当前配送：{rider.currentOrders?.map((order) => order.orderNo || order.id).join('、')}</div> : null}
            <div className="rider-actions">{status === 'ACTIVE' ? <><button type="button" onClick={() => onChangeStatus(rider, 'suspend')}>暂停接单</button><button type="button" onClick={() => onChangeStatus(rider, 'resign')}>标记离职</button></> : <button className="approve" type="button" onClick={() => onChangeStatus(rider, 'restore')}>恢复接单</button>}</div>
          </article>
        }) : <ResultState kind="empty" message={hasFilters ? '没有符合当前搜索和筛选条件的骑手，可清空条件后重试。' : '暂无有效骑手档案。'} />}
      </div>
      <Pagination page={page} total={filtered.length} onPage={setPage} />
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
              : order.actionText || (isWaitingPayment && !order.needsQuote && !order.awaitingQuoteConfirmation ? '待支付' : order.awaitingQuoteConfirmation ? '待确认报价' : order.displayStatus)}
        </button>
      </div>
    </article>
  )
}

function OrdersWorkspace({
  filter,
  orders,
  loading,
  error,
  authorized,
  onFilter,
  onAdvance,
  onQuote,
  onTicket
}: {
  filter: string
  orders: Order[]
  loading: boolean
  error: string
  authorized: boolean
  onFilter: (filter: string) => void
  onAdvance: (id: string) => void
  onQuote: (id: string, quotedFee: number, quoteNote: string) => Promise<void>
  onTicket: () => void
}) {
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState('ALL')
  const [createdStart, setCreatedStart] = useState('')
  const [createdEnd, setCreatedEnd] = useState('')
  const [page, setPage] = useState(1)
  const filteredOrders = orders.filter((order) => {
    const statusMatches = filter === '全部' || (filter === '进行中' ? order.status === '取货中' || order.status === '配送中' : order.displayStatus === filter)
    const haystack = [order.id, order.orderNo, order.userId, order.customerName, order.customerPhone, order.pickupContact, order.pickupPhone, order.dropoffContact, order.dropoffPhone, order.riderId, order.riderName, order.riderPhone, order.pickupName, order.pickupDetail, order.dropoffName, order.dropoffDetail].filter(Boolean).join(' ').toLowerCase()
    const deliveryMatches = deliveryFilter === 'ALL'
      || (deliveryFilter === 'UNASSIGNED' && !order.riderId && order.status !== '已完成' && order.status !== '已取消')
      || (deliveryFilter === 'ASSIGNED' && Boolean(order.riderId) && order.status !== '已完成' && order.status !== '已取消')
      || (deliveryFilter === 'IN_TRANSIT' && (order.status === '取货中' || order.status === '配送中'))
      || (deliveryFilter === 'FINISHED' && (order.status === '已完成' || order.status === '已取消'))
    return statusMatches && (!query || haystack.includes(query.toLowerCase())) && deliveryMatches && inDateRange(order.createdAt || order.createTime, createdStart, createdEnd)
  })
  const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasFilters = Boolean(query || filter !== '全部' || deliveryFilter !== 'ALL' || createdStart || createdEnd)
  const applySearch = () => { setQuery(draftQuery.trim()); setPage(1) }
  const clearSearch = () => {
    setDraftQuery(''); setQuery(''); onFilter('全部'); setDeliveryFilter('ALL'); setCreatedStart(''); setCreatedEnd(''); setPage(1)
  }
  useEffect(() => setPage(1), [filter, deliveryFilter, createdStart, createdEnd])
  return (
    <section className="workspace">
      <div className="workspace-heading">
        <div><h2>全部订单</h2><p className="muted">检索当前与历史订单，处理报价与履约进度。</p></div>
        <span className="result-count">{filteredOrders.length} 条结果</span>
      </div>
      <div className="search-panel order-search-panel">
        <form className="search-row" onSubmit={(event) => { event.preventDefault(); applySearch() }}>
          <label className="search-input"><span aria-hidden="true">⌕</span><input value={draftQuery} onChange={(event) => { const value = event.target.value; setDraftQuery(value); setQuery(value.trim()); setPage(1) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applySearch() } }} placeholder="搜索订单号、用户、骑手、手机号或配送地址" aria-label="搜索订单" />{draftQuery ? <button type="button" aria-label="清除搜索词" onClick={() => { setDraftQuery(''); setQuery(''); setPage(1) }}>×</button> : null}</label>
          <button className="search-submit" type="submit">搜索</button>
          {hasFilters ? <button className="clear-filters" type="button" onClick={clearSearch}>清空条件</button> : null}
        </form>
        <div className="advanced-filters order-advanced-filters">
          <label><span>配送状态</span><select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}><option value="ALL">全部配送状态</option><option value="UNASSIGNED">待分配骑手</option><option value="ASSIGNED">已分配骑手</option><option value="IN_TRANSIT">配送进行中</option><option value="FINISHED">配送已结束</option></select></label>
          <label className="date-filter"><span>下单时间</span><div><input type="date" value={createdStart} max={createdEnd || undefined} onChange={(event) => setCreatedStart(event.target.value)} aria-label="下单开始日期" /><b>至</b><input type="date" value={createdEnd} min={createdStart || undefined} onChange={(event) => setCreatedEnd(event.target.value)} aria-label="下单结束日期" /></div></label>
        </div>
        <div className="toolbar-actions status-filter-row">
          <div className="filters">
            {orderFilters.map((item) => (
              <button key={item} className={`filter-btn ${filter === item ? 'active' : ''}`} type="button" onClick={() => onFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        {hasFilters ? <div className="filter-feedback" aria-live="polite"><span>当前筛选</span>{query ? <b>关键词：{query}</b> : null}{filter !== '全部' ? <b>订单状态：{filter}</b> : null}{deliveryFilter !== 'ALL' ? <b>配送状态已筛选</b> : null}{createdStart || createdEnd ? <b>下单时间：{createdStart || '不限'} 至 {createdEnd || '不限'}</b> : null}</div> : null}
        {loading && orders.length ? <div className="data-notice" role="status">正在更新订单数据…</div> : error && orders.length ? <div className="data-notice error" role="alert">订单数据更新失败：{error}，当前显示上次成功加载的结果。</div> : null}
      </div>
      <div className="orders">
        {!authorized ? <ResultState kind="permission" message="请先登录运营账号后查看订单。" /> : loading && !orders.length ? <ResultState kind="loading" message="正在读取全部订单，请稍候。" /> : error && !orders.length ? <ResultState kind="error" message={`${error}，请检查服务连接后重试。`} /> : pagedOrders.length ? pagedOrders.map((order) => (
          <OrderCard key={order.id} order={order} onAdvance={onAdvance} onQuote={onQuote} onTicket={onTicket} />
        )) : <ResultState kind="empty" message={hasFilters ? '没有符合当前搜索和筛选条件的订单，可清空条件后重试。' : '暂无订单，用户端下单后会同步到这里。'} />}
      </div>
      <Pagination page={page} total={filteredOrders.length} onPage={setPage} />
    </section>
  )
}

export function OperationsApp() {
  const [apiBase, setApiBase] = useState(getInitialApiBase)
  const [token, setToken] = useState(getInitialToken)
  const [operatorId, setOperatorId] = useState(() => localStorage.getItem('merchantId') || DEFAULT_OPERATOR_ID)
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('merchantName') || '')
  const [showLogin, setShowLogin] = useState(() => !getInitialToken())
  const [loggingIn, setLoggingIn] = useState(false)
  const [filter, setFilter] = useState('全部')
  const [view, setView] = useState(() => window.location.hash.replace(/^#/, '') || 'orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [riders, setRiders] = useState<RiderApplication[]>([])
  const [managedRiders, setManagedRiders] = useState<RiderApplication[]>([])
  const [store, setStore] = useState<Store | null>(null)
  const [connected, setConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dataError, setDataError] = useState('')
  const [toast, setToast] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('merchantNewOrderSound') !== 'off')
  const [soundArmed, setSoundArmed] = useState(false)
  const [healthText, setHealthText] = useState('请先启动 NestJS 后端：cd server/api && npm run start:dev')
  const toastTimer = useRef(0)
  const refreshingRef = useRef(false)
  const orderAlertRef = useRef(new NewOrderAlert())
  const seenActionableOrderIdsRef = useRef<Set<string> | null>(null)
  const soundEnabledRef = useRef(soundEnabled)
  const soundArmedRef = useRef(false)

  const api = useMemo(() => new OperationsApi(apiBase.replace(/\/$/, ''), token), [apiBase, token])
  const stats = useMemo(() => calcStats(orders), [orders])
  const pendingRiderCount = useMemo(() => riders.filter((item) => (item.application?.applicationStatus || item.status) === 'PENDING').length, [riders])

  const navigate = useCallback((nextView: string) => {
    setView(nextView)
    window.history.replaceState(null, '', `#${nextView}`)
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }, [])

  const armOrderSound = useCallback(async (preview = false) => {
    const armed = await orderAlertRef.current.arm().catch(() => false)
    soundArmedRef.current = armed
    setSoundArmed(armed)
    if (armed && preview) orderAlertRef.current.play()
    return armed
  }, [])

  const toggleOrderSound = useCallback(async () => {
    if (!soundEnabled || !soundArmed) {
      localStorage.setItem('merchantNewOrderSound', 'on')
      soundEnabledRef.current = true
      setSoundEnabled(true)
      const armed = await armOrderSound(true)
      showToast(armed ? '新单提示音已开启' : '浏览器阻止了声音，请检查网站声音权限')
      return
    }
    localStorage.setItem('merchantNewOrderSound', 'off')
    soundEnabledRef.current = false
    setSoundEnabled(false)
    showToast('新单提示音已静音')
  }, [armOrderSound, showToast, soundArmed, soundEnabled])

  const notifyNewActionableOrders = useCallback((nextOrders: Order[]) => {
    const actionable = nextOrders.filter((order) => order.displayStatus === '待商家接单' || order.needsQuote)
    const nextIds = new Set(actionable.map((order) => order.id))
    const seen = seenActionableOrderIdsRef.current
    if (seen === null) {
      seenActionableOrderIdsRef.current = nextIds
      return
    }
    const fresh = actionable.filter((order) => !seen.has(order.id))
    nextIds.forEach((id) => seen.add(id))
    if (!fresh.length) return
    const played = soundEnabledRef.current && soundArmedRef.current && orderAlertRef.current.play()
    showToast(`收到 ${fresh.length} 个新订单${played ? '，请及时处理' : '，请及时处理（提示音未启用）'}`)
  }, [showToast])

  const loadDashboard = useCallback(async (silent = false) => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    if (!silent) setRefreshing(true)
    try {
      const [payload, riderApplications, riderList] = await Promise.all([api.listOrders(), api.listRiderApplications(), api.listRiders()])
      const dashboard = normalizeDashboard(payload, operatorId)
      notifyNewActionableOrders(dashboard.orders)
      setStore(dashboard.store)
      setOrders(dashboard.orders)
      setRiders(riderApplications)
      setManagedRiders(riderList)
      setConnected(true)
      setDataError('')
      setHealthText('已连接 NestJS 后端，订单状态会和用户端同步')
      if (!silent) showToast('订单已刷新')
    } catch (error) {
      setConnected(false)
      setDataError(error instanceof Error ? error.message : '后端连接失败')
      setHealthText(error instanceof Error ? error.message : '后端连接失败')
      if (error instanceof Error && error.message.includes('登录')) setShowLogin(true)
      if (!silent) showToast(`刷新失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      refreshingRef.current = false
      if (!silent) setRefreshing(false)
    }
  }, [api, notifyNewActionableOrders, operatorId, showToast])

  const completeOperatorLogin = useCallback(async (session: OperatorSession, cleanBase: string) => {
    setApiBase(cleanBase)
    localStorage.setItem('merchantApiBase', cleanBase)
    try {
      const nextToken = session.token
      const nextOperatorId = session.operator?.id || operatorId
      const nextOperatorName = session.operator?.name || '运营员'
      setToken(nextToken)
      setOperatorId(nextOperatorId)
      setOperatorName(nextOperatorName)
      sessionStorage.setItem('merchantToken', nextToken)
      localStorage.setItem('merchantId', nextOperatorId)
      localStorage.setItem('merchantName', nextOperatorName)
      setShowLogin(false)
      showToast('安全登录成功')
      const sessionApi = new OperationsApi(cleanBase, nextToken)
      const [payload, riderApplications, riderList] = await Promise.all([sessionApi.listOrders(), sessionApi.listRiderApplications(), sessionApi.listRiders()])
      const dashboard = normalizeDashboard(payload, nextOperatorId)
      notifyNewActionableOrders(dashboard.orders)
      setStore(dashboard.store)
      setOrders(dashboard.orders)
      setRiders(riderApplications)
      setManagedRiders(riderList)
      setConnected(true)
      setDataError('')
      setHealthText('已连接 NestJS 后端，订单状态会和用户端同步')
    } catch (error) {
      setConnected(false)
      const message = error instanceof Error ? error.message : '未知错误'
      setDataError(message)
      setHealthText(message)
      showToast(`登录失败：${message}`)
    } finally {
      setLoggingIn(false)
    }
  }, [notifyNewActionableOrders, operatorId, showToast])

  const loginOperator = useCallback(async (username: string, password: string) => {
    const cleanBase = apiBase.replace(/\/$/, '') || DEFAULT_API_BASE
    setApiBase(cleanBase)
    localStorage.setItem('merchantApiBase', cleanBase)
    localStorage.setItem('merchantUsername', username)
    setLoggingIn(true)
    try {
      const session = await new OperationsApi(cleanBase, '').login(username, password)
      await completeOperatorLogin(session, cleanBase)
    } catch (error) {
      setLoggingIn(false)
      showToast(`登录失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [apiBase, completeOperatorLogin, showToast])

  const logout = useCallback(() => {
    setToken('')
    setOperatorName('')
    setOrders([])
    setRiders([])
    setManagedRiders([])
    setStore(null)
    setConnected(false)
    setDataError('')
    seenActionableOrderIdsRef.current = null
    sessionStorage.removeItem('merchantToken')
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
    if (!window.confirm(approved ? '确认通过这条骑手申请？通过后原用户账号会获得骑手身份。' : '确认拒绝这条骑手申请？')) return
    const reason = approved ? '' : window.prompt('请输入拒绝原因（必填）', '')?.trim() || ''
    if (!approved && !reason) {
      showToast('拒绝申请必须填写原因')
      return
    }
    try {
      await api.reviewRider(rider, approved, reason)
      setRiders((current) => current.map((item) => {
        const sameApplication = (item.application?.applicationId || item.id) === (rider.application?.applicationId || rider.id)
        return sameApplication ? { ...item, status: approved ? 'APPROVED' : 'REJECTED', application: { ...item.application, applicationStatus: approved ? 'APPROVED' : 'REJECTED', rejectionReason: reason, reviewedAt: new Date().toISOString() } } : item
      }))
      showToast(approved ? '骑手已审核通过' : '骑手申请已拒绝')
      await loadDashboard(true)
    } catch (error) {
      showToast(`审核失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [api, loadDashboard, showToast])

  const changeRiderStatus = useCallback(async (rider: RiderApplication, action: 'suspend' | 'restore' | 'resign') => {
    const labels = { suspend: '暂停接单', restore: '恢复接单', resign: '标记离职' }
    if (!window.confirm(`确认${labels[action]}？`)) return
    const reason = window.prompt(`${labels[action]}原因（必填）`, '')?.trim() || ''
    if (!reason) {
      showToast('状态变更必须填写原因')
      return
    }
    try {
      await api.changeRiderStatus(rider.id, action, reason)
      showToast(`已${labels[action]}`)
      await loadDashboard(true)
    } catch (error) {
      showToast(`操作失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [api, loadDashboard, showToast])

  useEffect(() => {
    if (!token) return undefined
    loadDashboard(true)
    const timer = window.setInterval(() => loadDashboard(true), 5000)
    return () => window.clearInterval(timer)
  }, [loadDashboard, token])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    if (!soundEnabled || soundArmed) return undefined
    const armFromGesture = () => { void armOrderSound(false) }
    window.addEventListener('pointerdown', armFromGesture, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', armFromGesture, { capture: true })
  }, [armOrderSound, soundArmed, soundEnabled])

  useEffect(() => () => orderAlertRef.current.dispose(), [])

  useEffect(() => {
    const onHashChange = () => setView(window.location.hash.replace(/^#/, '') || 'orders')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const pageTitle = view === 'pricing' ? '价格规则' : view === 'service-areas' ? '服务范围' : view === 'rider-applications' ? '骑手申请' : view === 'riders' ? '骑手管理' : view === 'settings' ? '系统设置' : '订单调度中心'
  const pageSubtitle = view === 'pricing' ? '管理线路单价、距离计价和搬运服务费。' : view === 'service-areas' ? '圈定每项业务的服务边界，地址范围由后端最终判断。' : view === 'rider-applications' ? '审核骑手资料，记录每一次通过、拒绝和通知。' : view === 'riders' ? '管理骑手身份权限、在线状态和当前配送任务。' : view === 'settings' ? '管理营业状态、报价有效期和骑手履约边界。' : '集中处理用户订单、最终报价与配送进度。'

  return (
    <div className="shell">
      <Sidebar activeView={view} pendingRiderCount={pendingRiderCount} onNavigate={navigate} />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">今日运营</p>
            <h1>{pageTitle}</h1>
            <p className="muted">{pageSubtitle}</p>
          </div>
          <div className="top-actions">
            <label className="api-field">
              <span>服务地址</span>
              <input value={apiBase} aria-label="API 地址" onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <button className={`sound-btn ${soundEnabled && soundArmed ? 'on' : ''}`} type="button" onClick={toggleOrderSound} aria-pressed={soundEnabled && soundArmed} title="新订单到达时播放短提示音">
              <span className="sound-glyph" aria-hidden="true" />
              {soundEnabled ? (soundArmed ? '提示音已开启' : '启用提示音') : '提示音已静音'}
            </button>
            <button className="ghost-btn" type="button" onClick={token ? logout : () => setShowLogin(true)}>{token ? `${operatorName || '运营员'} · 退出` : '登录'}</button>
            <button className="primary-btn" type="button" onClick={() => loadDashboard(false)} disabled={refreshing}>
              {refreshing ? '刷新中' : '刷新'}
            </button>
          </div>
        </header>

        {view === 'orders' ? <>
          <StorePanel store={store} connected={connected} healthText={healthText} />
          <StatsGrid stats={stats} />
          <OrdersWorkspace
            filter={filter}
            orders={orders}
            loading={refreshing}
            error={dataError}
            authorized={Boolean(token)}
            onFilter={setFilter}
            onAdvance={advanceOrder}
            onQuote={quoteOrder}
            onTicket={() => showToast('已模拟打印小票')}
          />
        </> : view === 'rider-applications' ? <RiderApplicationsWorkspace riders={riders} onReview={reviewRider} /> : view === 'riders' ? <RidersWorkspace riders={managedRiders} loading={refreshing} error={dataError} authorized={Boolean(token)} onChangeStatus={changeRiderStatus} /> : view === 'pricing' ? <PricingWorkspace api={api} onToast={showToast} /> : view === 'service-areas' ? <ServiceAreasWorkspace api={api} onToast={showToast} /> : <SystemSettingsWorkspace api={api} onToast={showToast} />}
      </main>
      <Toast message={toast} />
      <LoginDialog
        open={showLogin}
        loading={loggingIn}
        onLogin={loginOperator}
        onClose={() => setShowLogin(false)}
      />
    </div>
  )
}

OperationsApp.displayName = 'OperationsApp'
