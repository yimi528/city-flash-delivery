import { useEffect, useRef, useState } from 'react'
import type { ConfigCategory, ConfigEnvelope, PricingConfig, PricingRuleConfig, ServiceAreaConfig, SystemSettingsConfig } from './types'
import type { OperationsApi } from './api'

type WorkspaceProps = { api: OperationsApi; onToast: (message: string) => void }

const SERVICE_NAMES: Record<string, string> = {
  carpool_ride: '拼车', send_parcel: '寄货', cargo_haul: '运货', urgent_delivery: '急送', pickup: '帮取', buy_for_me: '帮买', pedicab_delivery: '送货/送客', moving_handling: '搬运装卸'
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2)
}

function fen(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0
}

function ConfigActions({ category, version, dirty, saving, onSave, onPublish }: { category: ConfigCategory; version: number; dirty: boolean; saving: boolean; onSave: () => void; onPublish: () => void }) {
  return <div className="config-actions">
    <div><span className={`config-dot ${dirty ? 'dirty' : ''}`} />{dirty ? '有未保存的草稿' : `已发布版本 v${version}`}</div>
    <div className="config-action-buttons">
      <button className="light-btn" type="button" onClick={onSave} disabled={saving || !dirty}>{saving ? '保存中…' : '保存草稿'}</button>
      <button className="primary-btn" type="button" onClick={onPublish} disabled={saving || !dirty}>发布变更</button>
    </div>
  </div>
}

function NumberField({ label, value, suffix, onChange, step = '0.01' }: { label: string; value: string | number; suffix?: string; onChange: (value: string) => void; step?: string }) {
  return <label className="config-field"><span>{label}</span><div className="number-input"><input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} /><em>{suffix}</em></div></label>
}

export function PricingWorkspace({ api, onToast }: WorkspaceProps) {
  const [envelope, setEnvelope] = useState<ConfigEnvelope<PricingConfig> | null>(null)
  const [payload, setPayload] = useState<PricingConfig | null>(null)
  const [activeService, setActiveService] = useState('carpool_ride')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.getConfig<PricingConfig>('PRICING').then((data) => {
      setEnvelope(data)
      setPayload(clone(data.draft?.payload || data.live))
      setLoading(false)
    }).catch((error) => { setLoading(false); onToast(`价格规则加载失败：${error instanceof Error ? error.message : '未知错误'}`) })
  }
  useEffect(load, [api])

  const rule = payload?.rules.find((item) => item.serviceId === activeService)
  const routes = payload?.routes.filter((item) => item.serviceId === activeService) || []
  const updateRule = (key: keyof PricingRuleConfig, value: string) => {
    if (!payload || !rule) return
    const nextValue = ['pricingMode', 'serviceId', 'id'].includes(key)
      ? value
      : key === 'weatherMultiplierBps'
        ? Math.round(Number(value || 1) * 10000)
        : ['includedDistanceMeters', 'maxDistanceMeters'].includes(key)
          ? Math.max(0, Math.round(Number(value || 0)))
          : fen(value)
    setPayload({ ...payload, rules: payload.rules.map((item) => item.serviceId === activeService ? { ...item, [key]: nextValue } : item) })
  }
  const updateRoute = (id: string, key: string, value: string | boolean) => {
    if (!payload) return
    setPayload({ ...payload, routes: payload.routes.map((item) => item.id === id ? { ...item, [key]: key === 'unitPriceFen' && typeof value === 'string' ? fen(value) : key === 'sortOrder' && typeof value === 'string' ? Number(value || 0) : value } : item) })
  }
  const dirty = Boolean(envelope && payload && JSON.stringify(payload) !== JSON.stringify(envelope.live))
  const save = async () => {
    if (!envelope || !payload) return
    setSaving(true)
    try { await api.saveConfigDraft('PRICING', envelope.version, payload); onToast('价格规则草稿已保存'); load() } catch (error) { onToast(`保存失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setSaving(false) }
  }
  const publish = async () => {
    if (!dirty) return
    if (!window.confirm('发布后新报价会立即使用这套价格，历史订单不会变化。确认发布？')) return
    try { if (envelope && payload) await api.saveConfigDraft('PRICING', envelope.version, payload); await api.publishConfig('PRICING'); onToast('价格规则已发布'); load() } catch (error) { onToast(`发布失败：${error instanceof Error ? error.message : '未知错误'}`) }
  }

  if (loading || !payload || !envelope) return <section className="config-page"><div className="empty">正在加载价格规则…</div></section>
  return <section className="config-page">
    <div className="config-heading"><div><p className="eyebrow">配置中心 · 01</p><h2>价格规则</h2><p className="muted">所有价格以分存储，发布后只影响新报价。</p></div><span className="version-badge">正式版本 v{envelope.version}</span></div>
    <div className="config-layout">
      <aside className="config-sidebar"><div className="config-sidebar-title">业务类型</div>{payload.services.filter((service) => service.id !== 'moving').map((service) => <button type="button" key={service.id} className={`config-service-item ${service.id === activeService ? 'active' : ''}`} onClick={() => setActiveService(service.id)}><strong>{service.name || SERVICE_NAMES[service.id]}</strong><span>{service.vehicleName || '固定车型'}</span></button>)}</aside>
      <div className="config-main">
        {rule ? <>
          <div className="config-card config-card-intro"><div><span className="service-kicker">{SERVICE_NAMES[activeService] || activeService}</span><h3>{payload.services.find((item) => item.id === activeService)?.vehicleName || '固定车型'}</h3><p>计价模式：{rule.pricingMode === 'fixed_route' ? '固定线路' : rule.pricingMode === 'handling_fixed' ? '搬运服务' : '距离计价'}</p></div><span className={`status-pill ${rule.enabled ? 'online' : ''}`}>{rule.enabled ? '启用中' : '已停用'}</span></div>
          <div className="config-card"><h3>基础计价</h3><div className="config-fields">
            <NumberField label="基础服务费" value={money(rule.baseFeeFen)} suffix="元" onChange={(value) => updateRule('baseFeeFen', value)} />
            <NumberField label="业务附加费" value={money(rule.serviceSurchargeFen)} suffix="元" onChange={(value) => updateRule('serviceSurchargeFen', value)} />
            <NumberField label="最低收费" value={money(rule.minimumFeeFen)} suffix="元" onChange={(value) => updateRule('minimumFeeFen', value)} />
            <NumberField label="封顶价格" value={money(rule.maxFeeFen)} suffix="元（0=不封顶）" onChange={(value) => updateRule('maxFeeFen', value)} />
          </div></div>
          {rule.pricingMode !== 'fixed_route' ? <div className="config-card"><h3>距离计价</h3><div className="config-fields">
            <NumberField label="起步距离" value={(rule.includedDistanceMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => updateRule('includedDistanceMeters', String(Number(value || 0) * 1000))} />
            <NumberField label="超出每公里" value={money(rule.perKmFen)} suffix="元" onChange={(value) => updateRule('perKmFen', value)} />
            <NumberField label="配送起步价" value={money(rule.deliveryStartFeeFen)} suffix="元" onChange={(value) => updateRule('deliveryStartFeeFen', value)} />
            <NumberField label="最大服务距离" value={(rule.maxDistanceMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => updateRule('maxDistanceMeters', String(Number(value || 0) * 1000))} />
            <NumberField label="恶劣天气倍率" value={(rule.weatherMultiplierBps / 10000).toFixed(2)} suffix="倍" onChange={(value) => updateRule('weatherMultiplierBps', value)} step="0.01" />
          </div></div> : null}
          {rule.pricingMode === 'fixed_route' ? <div className="config-card"><div className="card-title-row"><h3>线路价格</h3><button className="text-btn" type="button" onClick={() => setPayload({ ...payload, routes: [...payload.routes, { id: `route-${Date.now()}`, serviceId: activeService, originName: '福鼎', destinationName: '新线路', priceUnit: activeService === 'carpool_ride' ? 'PER_PERSON' : 'PER_ORDER', unitPriceFen: 0, enabled: true, sortOrder: routes.length + 1, version: envelope.version }] })}>+ 新增线路</button></div><div className="route-table"><div className="route-row route-head"><span>目的地</span><span>计价单位</span><span>价格</span><span>状态</span></div>{routes.map((route) => <div className="route-row" key={route.id}><input value={route.destinationName} onChange={(event) => updateRoute(route.id, 'destinationName', event.target.value)} /><select value={route.priceUnit} onChange={(event) => updateRoute(route.id, 'priceUnit', event.target.value)}><option value="PER_PERSON">每人</option><option value="PER_ORDER">每单</option></select><NumberField label="" value={money(route.unitPriceFen)} suffix="元" onChange={(value) => updateRoute(route.id, 'unitPriceFen', value)} /><label className="switch-field"><input type="checkbox" checked={route.enabled} onChange={(event) => updateRoute(route.id, 'enabled', event.target.checked)} /><span>{route.enabled ? '启用' : '停用'}</span></label></div>)}</div></div> : null}
          <div className="config-card preview-card"><div><span className="service-kicker">即时预览</span><h3>{rule.pricingMode === 'fixed_route' ? '线路单价由上方线路表决定' : '6 公里订单预估'}</h3></div><strong>{rule.pricingMode === 'fixed_route' ? money(routes[0]?.unitPriceFen || 0) : money(Math.max(rule.minimumFeeFen, rule.baseFeeFen + rule.serviceSurchargeFen + rule.deliveryStartFeeFen + Math.ceil(Math.max(0, 6000 - rule.includedDistanceMeters) / 1000) * rule.perKmFen))} 元</strong></div>
        </> : <div className="empty">该业务尚未创建价格规则。</div>}
      </div>
    </div>
    <ConfigActions category="PRICING" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} />
  </section>
}

const defaultPolygon = { type: 'Polygon' as const, coordinates: [[[119.35, 27.0], [120.1, 27.0], [120.1, 27.6], [119.35, 27.6], [119.35, 27.0]]] }

function MapPreview({ boundary }: { boundary: ServiceAreaConfig['boundaryGeoJson'] }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = import.meta.env.VITE_TENCENT_MAP_JS_KEY
    if (!key || !container.current) return undefined
    const mount = () => {
      const tMap = (window as any).TMap
      if (!tMap || !container.current) return
      try {
        const center = boundary?.coordinates?.[0]?.[0] || [119.7, 27.2]
        const map = new tMap.Map(container.current, { center: new tMap.LatLng(center[1], center[0]), zoom: 9, pitch: 0 })
        const points = boundary?.coordinates?.[0]?.map(([lng, lat]) => new tMap.LatLng(lat, lng)) || []
        if (points.length > 3 && tMap.MultiPolygon) new tMap.MultiPolygon({ map, geometries: [{ paths: points, styleId: 'coverage' }] })
      } catch {
        // The coordinate editor remains available if the browser map SDK is unavailable.
      }
    }
    const existing = document.getElementById('tencent-map-gl-sdk') as HTMLScriptElement | null
    if (existing) { if ((window as any).TMap) mount(); else existing.addEventListener('load', mount, { once: true }); return undefined }
    const script = document.createElement('script')
    script.id = 'tencent-map-gl-sdk'
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.async = true
    script.addEventListener('load', mount, { once: true })
    document.head.appendChild(script)
    return undefined
  }, [boundary])
  return <div className="area-map" ref={container}><span>{import.meta.env.VITE_TENCENT_MAP_JS_KEY ? '腾讯地图区域预览' : '未配置浏览器地图 Key，当前显示坐标预览'}</span><div className="area-shape" /></div>
}

export function ServiceAreasWorkspace({ api, onToast }: WorkspaceProps) {
  const [envelope, setEnvelope] = useState<ConfigEnvelope<{ areas: ServiceAreaConfig[]; policies: Array<{ serviceId: string; enforcementEnabled: boolean }> }> | null>(null)
  const [payload, setPayload] = useState<{ areas: ServiceAreaConfig[]; policies: Array<{ serviceId: string; enforcementEnabled: boolean }> } | null>(null)
  const [activeId, setActiveId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); api.getConfig<any>('SERVICE_AREA').then((data) => { setEnvelope(data); const next = clone(data.draft?.payload || data.live); next.areas = (next.areas || []).map((area: ServiceAreaConfig) => ({ ...area, serviceIds: area.serviceIds || area.bindings?.map((item) => item.serviceId) || [] })); setPayload(next); setActiveId(next.areas[0]?.id || 'new'); setLoading(false) }).catch((error) => { setLoading(false); onToast(`服务范围加载失败：${error instanceof Error ? error.message : '未知错误'}`) }) }
  useEffect(load, [api])
  const active = payload?.areas.find((item) => item.id === activeId)
  const dirty = Boolean(envelope && payload && JSON.stringify(payload) !== JSON.stringify(envelope.live))
  const updateActive = (updates: Partial<ServiceAreaConfig>) => { if (!payload) return; setPayload({ ...payload, areas: payload.areas.map((item) => item.id === activeId ? { ...item, ...updates } : item) }) }
  const save = async () => { if (!envelope || !payload) return; setSaving(true); try { await api.saveConfigDraft('SERVICE_AREA', envelope.version, payload); onToast('服务范围草稿已保存'); load() } catch (error) { onToast(`保存失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setSaving(false) } }
  const publish = async () => { if (!dirty || !envelope || !payload) return; if (!window.confirm('发布后启用的业务会立即校验服务范围，确认发布？')) return; try { await api.saveConfigDraft('SERVICE_AREA', envelope.version, payload); await api.publishConfig('SERVICE_AREA'); onToast('服务范围已发布'); load() } catch (error) { onToast(`发布失败：${error instanceof Error ? error.message : '未知错误'}`) } }
  const addArea = () => { if (!payload) return; const id = `area-${Date.now()}`; setPayload({ ...payload, areas: [...payload.areas, { id, name: '新服务区域', enabled: true, boundaryGeoJson: defaultPolygon, serviceIds: ['urgent_delivery'], sortOrder: payload.areas.length + 1, version: envelope?.version || 1 }] }); setActiveId(id) }
  const updatePolicy = (serviceId: string, enabled: boolean) => { if (!payload) return; const exists = payload.policies.some((item) => item.serviceId === serviceId); setPayload({ ...payload, policies: exists ? payload.policies.map((item) => item.serviceId === serviceId ? { ...item, enforcementEnabled: enabled } : item) : [...payload.policies, { serviceId, enforcementEnabled: enabled }] }) }
  const updateCoordinates = (value: string) => { try { const parsed = JSON.parse(value); updateActive({ boundaryGeoJson: parsed }) } catch { /* Keep text editable until it becomes valid JSON. */ } }
  if (loading || !payload || !envelope) return <section className="config-page"><div className="empty">正在加载服务范围…</div></section>
  return <section className="config-page"><div className="config-heading"><div><p className="eyebrow">配置中心 · 02</p><h2>服务范围</h2><p className="muted">按业务绑定多个区域，边界点视为范围内。</p></div><button className="primary-btn" type="button" onClick={addArea}>+ 新增区域</button></div>
    <div className="area-layout"><aside className="config-sidebar">{payload.areas.map((area) => <button type="button" key={area.id} className={`config-service-item ${area.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(area.id)}><strong>{area.name}</strong><span>{area.enabled ? '已启用' : '已停用'}</span></button>)}{!payload.areas.length ? <div className="empty compact">还没有区域</div> : null}</aside><div className="config-main">{active ? <><div className="config-card"><div className="card-title-row"><h3>区域信息</h3><label className="switch-field"><input type="checkbox" checked={active.enabled} onChange={(event) => updateActive({ enabled: event.target.checked })} /><span>{active.enabled ? '区域启用' : '区域停用'}</span></label></div><div className="config-fields"><label className="config-field"><span>区域名称</span><input value={active.name} onChange={(event) => updateActive({ name: event.target.value })} /></label><label className="config-field"><span>绑定业务</span><div className="service-checks">{Object.entries(SERVICE_NAMES).map(([id, name]) => <label key={id}><input type="checkbox" checked={(active.serviceIds || active.bindings?.map((item) => item.serviceId) || []).includes(id)} onChange={(event) => updateActive({ serviceIds: event.target.checked ? [...(active.serviceIds || []), id] : (active.serviceIds || []).filter((item) => item !== id) })} />{name}</label>)}</div></label></div></div><div className="config-card"><h3>区域坐标</h3><p className="muted">输入闭合 GeoJSON Polygon；保存前会校验顶点数量、经纬度和空间有效性。</p><textarea className="geojson-input" value={JSON.stringify(active.boundaryGeoJson || defaultPolygon, null, 2)} onChange={(event) => updateCoordinates(event.target.value)} spellCheck={false} /><div className="area-preview"><span>区域预览</span><MapPreview boundary={active.boundaryGeoJson || defaultPolygon} /></div></div><div className="config-card"><div className="card-title-row"><div><h3>范围校验开关</h3><p className="muted">开启后，绑定该业务的地址必须落在已启用区域内。</p></div>{payload.policies.map((policy) => <label className="switch-field" key={policy.serviceId}><input type="checkbox" checked={policy.enforcementEnabled} onChange={(event) => updatePolicy(policy.serviceId, event.target.checked)} /><span>{SERVICE_NAMES[policy.serviceId] || policy.serviceId}：{policy.enforcementEnabled ? '校验中' : '暂不限制'}</span></label>)}</div></div></> : <div className="empty">请选择或新增一个服务区域。</div>}</div></div><ConfigActions category="SERVICE_AREA" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} /></section>
}

const DEFAULT_HOURS: SystemSettingsConfig['weeklyHours'] = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), [{ start: '00:00', end: '24:00' }]]))

function PasswordChangeCard({ api, onToast }: WorkspaceProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (newPassword.length < 12) { onToast('新密码至少需要 12 位'); return }
    if (newPassword !== confirmPassword) { onToast('两次输入的新密码不一致'); return }
    setSaving(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onToast('运营密码已修改，请使用新密码重新登录')
    } catch (error) {
      onToast(`密码修改失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setSaving(false) }
  }

  return <div className="config-card settings-card"><h3>修改运营密码</h3><p className="muted">生产环境请使用密码管理器生成并保存至少 12 位随机密码。</p><div className="config-fields"><label className="config-field"><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="config-field"><span>新密码</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="config-field"><span>确认新密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></div><button className="light-btn" type="button" disabled={saving || !currentPassword || !newPassword || !confirmPassword} onClick={submit}>{saving ? '修改中…' : '修改密码'}</button></div>
}

export function SystemSettingsWorkspace({ api, onToast }: WorkspaceProps) {
  const [envelope, setEnvelope] = useState<ConfigEnvelope<{ settings: SystemSettingsConfig }> | null>(null)
  const [settings, setSettings] = useState<SystemSettingsConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); api.getConfig<any>('SYSTEM').then((data) => { setEnvelope(data); setSettings(clone(data.draft?.payload?.settings || data.live.settings || data.live)); setLoading(false) }).catch((error) => { setLoading(false); onToast(`系统设置加载失败：${error instanceof Error ? error.message : '未知错误'}`) }) }
  useEffect(load, [api])
  const dirty = Boolean(envelope && settings && JSON.stringify(settings) !== JSON.stringify(envelope.live.settings || envelope.live))
  const update = (updates: Partial<SystemSettingsConfig>) => setSettings((current) => current ? { ...current, ...updates } : current)
  const save = async () => { if (!envelope || !settings) return; setSaving(true); try { await api.saveConfigDraft('SYSTEM', envelope.version, { settings }); onToast('系统设置草稿已保存'); load() } catch (error) { onToast(`保存失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setSaving(false) } }
  const publish = async () => { if (!dirty || !envelope || !settings) return; if (!window.confirm('发布后营业状态、报价有效期和骑手调度参数会立即生效，确认发布？')) return; try { await api.saveConfigDraft('SYSTEM', envelope.version, { settings }); await api.publishConfig('SYSTEM'); onToast('系统设置已发布'); load() } catch (error) { onToast(`发布失败：${error instanceof Error ? error.message : '未知错误'}`) } }
  if (loading || !settings || !envelope) return <section className="config-page"><div className="empty">正在加载系统设置…</div></section>
  const hours = settings.weeklyHours || DEFAULT_HOURS
  return <section className="config-page"><div className="config-heading"><div><p className="eyebrow">配置中心 · 03</p><h2>系统设置</h2><p className="muted">控制营业状态、报价时效和骑手履约边界。</p></div><span className={`status-pill ${settings.acceptingOrders ? 'online' : ''}`}>{settings.acceptingOrders ? '营业中' : '已暂停接单'}</span></div><div className="settings-grid"><div className="config-card settings-card"><div className="card-title-row"><div><h3>营业状态</h3><p className="muted">暂停只影响新报价和新订单，已有订单继续履约。</p></div><label className="switch-field"><input type="checkbox" checked={settings.acceptingOrders} onChange={(event) => update({ acceptingOrders: event.target.checked })} /><span>{settings.acceptingOrders ? '接受新订单' : '暂停接单'}</span></label></div><label className="config-field"><span>暂停原因</span><input value={settings.closureReason} onChange={(event) => update({ closureReason: event.target.value })} placeholder="例如：恶劣天气临时暂停" /></label></div><div className="config-card settings-card"><h3>客服与公告</h3><div className="config-fields"><label className="config-field"><span>客服电话</span><input value={settings.customerServicePhone} onChange={(event) => update({ customerServicePhone: event.target.value })} placeholder="0593-8888888" /></label><label className="config-field"><span>公告标题</span><input value={settings.announcementTitle} onChange={(event) => update({ announcementTitle: event.target.value })} /></label></div><label className="config-field"><span>公告内容</span><textarea value={settings.announcementContent} onChange={(event) => update({ announcementContent: event.target.value })} rows={3} /></label><label className="switch-field"><input type="checkbox" checked={settings.announcementEnabled} onChange={(event) => update({ announcementEnabled: event.target.checked })} /><span>在用户端展示公告</span></label></div><div className="config-card settings-card"><h3>报价与取消</h3><div className="config-fields"><NumberField label="报价有效期" value={settings.quoteValidityMinutes} suffix="分钟" onChange={(value) => update({ quoteValidityMinutes: Number(value || 10) })} step="1" /></div><label className="switch-field"><input type="checkbox" checked={settings.allowCancelBeforeClaim} onChange={(event) => update({ allowCancelBeforeClaim: event.target.checked })} /><span>骑手接单前允许用户自助取消</span></label></div><div className="config-card settings-card"><h3>骑手调度</h3><div className="config-fields"><NumberField label="抢单半径" value={(settings.riderOrderRadiusMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => update({ riderOrderRadiusMeters: Number(value || 30) * 1000 })} /><NumberField label="最大进行中订单" value={settings.riderMaxActiveOrders} suffix="单" onChange={(value) => update({ riderMaxActiveOrders: Number(value || 1) })} step="1" /></div></div><div className="config-card settings-card"><h3>每周营业时间</h3><div className="hours-grid">{['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, day) => <label key={label}><span>{label}</span><input value={hours[String(day)]?.[0]?.start || '00:00'} onChange={(event) => update({ weeklyHours: { ...hours, [String(day)]: [{ ...(hours[String(day)]?.[0] || {}), start: event.target.value }] } })} /><b>至</b><input value={hours[String(day)]?.[0]?.end || '24:00'} onChange={(event) => update({ weeklyHours: { ...hours, [String(day)]: [{ ...(hours[String(day)]?.[0] || {}), end: event.target.value }] } })} /></label>)}</div></div><PasswordChangeCard api={api} onToast={onToast} /></div><ConfigActions category="SYSTEM" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} /></section>
}
