import { useEffect, useState } from 'react'
import type { ConfigCategory, ConfigEnvelope, ParcelPricingConfig, PricingConfig, PricingRuleConfig, ServiceAreaConfig, ServiceCityConfig, SystemSettingsConfig } from './types'
import type { OperationsApi } from './api'

type WorkspaceProps = { api: OperationsApi; onToast: (message: string) => void }

const SERVICE_CATALOG = [
  { id: 'send_parcel', name: '寄货/配送', icon: '📦', subtitle: '普通货物 · 宠物' },
  { id: 'carpool_ride', name: '顺风车', icon: '🚘', subtitle: '固定线路顺风车' },
  { id: 'cargo_haul', name: '运货', icon: '🚚', subtitle: '货三轮车' },
  { id: 'moving_handling', name: '搬运装卸', icon: '🏗️', subtitle: '搬家 · 搬店 · 装卸' },
  { id: 'urgent_delivery', name: '急送', icon: '⚡', subtitle: '二轮急送' },
  { id: 'pickup', name: '帮取', icon: '📥', subtitle: '二轮车' },
  { id: 'buy_for_me', name: '帮买', icon: '🛍️', subtitle: '二轮车' },
  { id: 'pedicab_delivery', name: '送货/送客', icon: '🛺', subtitle: '人力三轮车' },
] as const

const SERVICE_NAMES: Record<string, string> = Object.fromEntries(SERVICE_CATALOG.map((service) => [service.id, service.name]))

const WEATHER_SERVICE_IDS = new Set(['urgent_delivery', 'pickup', 'buy_for_me'])

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

const PARCEL_PRICE_OPTIONS: Array<{ itemType: ParcelPricingConfig['itemType']; weightBand: ParcelPricingConfig['weightBand']; label: string }> = [
  { itemType: 'NORMAL', weightBand: 'UP_TO_10', label: '普通货物 ≤10kg' },
  { itemType: 'NORMAL', weightBand: 'UP_TO_30', label: '普通货物 ≤30kg' },
  { itemType: 'PET', weightBand: 'ANY', label: '宠物' },
]

function parcelPrice(rule: PricingRuleConfig, routeId: string, itemType: ParcelPricingConfig['itemType'], weightBand: ParcelPricingConfig['weightBand']) {
  return rule.parcelPricing?.find((entry) => entry.routeId === routeId && entry.itemType === itemType && entry.weightBand === weightBand)?.priceFen || 1
}

type PricingKind = 'parcel' | 'route' | 'distance' | 'handling'

function pricingKind(serviceId: string, rule?: PricingRuleConfig): PricingKind {
  if (serviceId === 'send_parcel' || rule?.pricingMode === 'parcel_category') return 'parcel'
  if (rule?.pricingMode === 'fixed_route') return 'route'
  if (rule?.pricingMode === 'handling_fixed') return 'handling'
  return 'distance'
}

function pricingKindLabel(kind: PricingKind) {
  return {
    parcel: '线路 + 物品 + 重量',
    route: '固定线路按人',
    distance: '按驾车距离',
    handling: '固定上门服务',
  }[kind]
}

function pricingKindDescription(kind: PricingKind) {
  return {
    parcel: '先选线路，再按物品类型和重量填写价格；不按公里数计价。',
    route: '只按线路单价和乘客人数计价，不使用基础费、距离费或天气费。',
    distance: '配置起步价、起步包含距离和超出每公里价格；只有二轮车另有恶劣天气加价。',
    handling: '只配置上门人工服务费；如果还要运输，请选择“运货”并在备注中说明装卸需求。',
    }[kind]
}

function startingFee(rule: PricingRuleConfig) {
  return Number(rule.baseFeeFen || 0) + Number(rule.serviceSurchargeFen || 0)
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

function NumberField({ label, value, suffix, onChange, step = '0.01', placeholder }: { label: string; value: string | number; suffix?: string; onChange: (value: string) => void; step?: string; placeholder?: string }) {
  const [inputValue, setInputValue] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setInputValue(String(value))
  }, [editing, value])
  return <label className="config-field"><span>{label}</span><div className="number-input"><input
    type="number"
    min="0"
    step={step}
    value={inputValue}
    placeholder={placeholder}
    onFocus={() => setEditing(true)}
    onChange={(event) => {
      setInputValue(event.target.value)
      onChange(event.target.value)
    }}
    onBlur={() => setEditing(false)}
  /><em>{suffix}</em></div></label>
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
  const kind = pricingKind(activeService, rule)
  const activeServiceConfig = payload?.services.find((item) => item.id === activeService)
  const showsWeather = kind === 'distance' && WEATHER_SERVICE_IDS.has(activeService)
  const parcelEnabledRoutes = routes.filter((route) => route.enabled)
  const parcelReady = Boolean(rule && kind === 'parcel' && parcelEnabledRoutes.length > 0 && parcelEnabledRoutes.every((route) => PARCEL_PRICE_OPTIONS.every((option) => (rule.parcelPricing || []).some((entry) => entry.routeId === route.id && entry.itemType === option.itemType && entry.weightBand === option.weightBand && entry.enabled && entry.priceFen > 1))))
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
  const updateStartingFee = (value: string) => {
    if (!payload || !rule) return
    const nextValue = fen(value)
    setPayload({ ...payload, rules: payload.rules.map((item) => item.serviceId === activeService ? { ...item, baseFeeFen: nextValue, serviceSurchargeFen: 0, minimumFeeFen: 0, maxFeeFen: 0 } : item) })
  }
  const updateRoute = (id: string, key: string, value: string | boolean) => {
    if (!payload) return
    setPayload({ ...payload, routes: payload.routes.map((item) => item.id === id ? { ...item, [key]: key === 'unitPriceFen' && typeof value === 'string' ? fen(value) : key === 'sortOrder' && typeof value === 'string' ? Number(value || 0) : value } : item) })
  }
  const removeRoute = (id: string) => {
    if (!payload) return
    if (!window.confirm('删除后发布配置才会正式停用这条线路，确认删除？')) return
    setPayload({ ...payload, routes: payload.routes.filter((item) => item.id !== id) })
  }
  const addRoute = () => {
    if (!payload || !envelope) return
    setPayload({ ...payload, routes: [...payload.routes, { id: `route-${Date.now()}`, serviceId: activeService, originName: '福鼎', destinationName: '新线路', priceUnit: activeService === 'carpool_ride' ? 'PER_PERSON' : 'PER_ORDER', unitPriceFen: 1, enabled: true, sortOrder: routes.length + 1, version: envelope.version }] })
  }
  const updateParcelPrice = (routeId: string, option: typeof PARCEL_PRICE_OPTIONS[number], value: string) => {
    if (!payload || !rule) return
    const nextPrice = Math.max(1, fen(value))
    const current = rule.parcelPricing || []
    const exists = current.some((entry) => entry.routeId === routeId && entry.itemType === option.itemType && entry.weightBand === option.weightBand)
    const nextEntries = exists
      ? current.map((entry) => entry.routeId === routeId && entry.itemType === option.itemType && entry.weightBand === option.weightBand ? { ...entry, priceFen: nextPrice } : entry)
      : [...current, { routeId, itemType: option.itemType, weightBand: option.weightBand, priceFen: nextPrice, enabled: true }]
    setPayload({ ...payload, rules: payload.rules.map((item) => item.serviceId === activeService ? { ...item, parcelPricing: nextEntries } : item) })
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
          <div className="config-card config-card-intro"><div><span className="service-kicker">{SERVICE_NAMES[activeService] || activeService}</span><h3>{activeServiceConfig?.vehicleName || '固定车型'}</h3><p>{pricingKindDescription(kind)}</p></div><div className="pricing-intro-meta"><span className="pricing-mode-badge">{pricingKindLabel(kind)}</span><span className={`status-pill ${rule.enabled ? 'online' : ''}`}>{rule.enabled ? '启用中' : '已停用'}</span></div></div>

          {kind === 'parcel' ? <>
            <div className="config-card pricing-guide-card"><div><h3>寄货怎么定价</h3><p className="config-card-note">先维护线路，再在价格矩阵中填写每条线路的物品和重量价格。线路本身不按公里数收费，0.01 元代表待配置。</p></div><div className="pricing-steps"><span><b>1</b>维护线路</span><span><b>2</b>填写价格矩阵</span><span><b>3</b>发布后生效</span></div></div>
            <div className="config-card"><div className="card-title-row"><div><h3>寄货线路</h3><p className="config-card-note">线路只决定价格矩阵的第一维，价格统一按“每单”计算。</p></div><button className="text-btn" type="button" onClick={addRoute}>+ 新增线路</button></div><div className="route-table"><div className="route-row parcel-route-row route-head"><span>出发地</span><span>目的地</span><span>价格设置</span><span>状态/操作</span></div>{routes.map((route) => <div className="route-row parcel-route-row" key={route.id}><input value={route.originName} onChange={(event) => updateRoute(route.id, 'originName', event.target.value)} /><input value={route.destinationName} onChange={(event) => updateRoute(route.id, 'destinationName', event.target.value)} /><span className="muted">下方价格矩阵</span><div className="route-actions"><label className="switch-field"><input type="checkbox" checked={route.enabled} onChange={(event) => updateRoute(route.id, 'enabled', event.target.checked)} /><span>{route.enabled ? '启用' : '停用'}</span></label><button className="remove-btn" type="button" onClick={() => removeRoute(route.id)}>删除</button></div></div>)}</div></div>
            <div className="config-card"><div className="card-title-row"><div><h3>物品 × 重量价格矩阵</h3><p className="config-card-note">每条线路分别配置普通货物和宠物价格；普通货物超过 30kg 不允许下单。</p></div><span className={`pricing-state ${parcelReady ? 'ready' : 'pending'}`}>{parcelReady ? '已有可用价格' : '当前仍待配置'}</span></div><div className="route-table"><div className="route-row parcel-matrix-row route-head"><span>目的地</span>{PARCEL_PRICE_OPTIONS.map((option) => <span key={`${option.itemType}-${option.weightBand}`}>{option.label}</span>)}<span>状态</span></div>{routes.map((route) => <div className="route-row parcel-matrix-row" key={`matrix-${route.id}`}><strong>{route.destinationName}</strong>{PARCEL_PRICE_OPTIONS.map((option) => { const priceFen = parcelPrice(rule, route.id, option.itemType, option.weightBand); return <NumberField key={`${route.id}-${option.itemType}-${option.weightBand}`} label="" value={priceFen > 1 ? money(priceFen) : ''} placeholder="待配置" suffix="元" onChange={(value) => updateParcelPrice(route.id, option, value)} /> })}<span className="muted">{route.enabled ? '启用' : '停用'}</span></div>)}</div></div>
          </> : null}

          {kind === 'route' ? <div className="config-card"><div className="card-title-row"><div><h3>线路票价</h3><p className="config-card-note">只配置线路单价和计价单位；乘客人数会自动乘在线路价上，不需要填写基础费或距离费。空白价格表示待配置。</p></div><button className="text-btn" type="button" onClick={addRoute}>+ 新增线路</button></div><div className="route-table"><div className="route-row route-price-row route-head"><span>出发地</span><span>目的地</span><span>计价单位</span><span>单价</span><span>状态/操作</span></div>{routes.map((route) => <div className="route-row route-price-row" key={route.id}><input value={route.originName} onChange={(event) => updateRoute(route.id, 'originName', event.target.value)} /><input value={route.destinationName} onChange={(event) => updateRoute(route.id, 'destinationName', event.target.value)} /><select value={route.priceUnit} onChange={(event) => updateRoute(route.id, 'priceUnit', event.target.value)}><option value="PER_PERSON">每人</option><option value="PER_ORDER">每单</option></select><NumberField label="" value={route.unitPriceFen > 1 ? money(route.unitPriceFen) : ''} placeholder="待配置" suffix="元" onChange={(value) => updateRoute(route.id, 'unitPriceFen', value)} /><div className="route-actions"><label className="switch-field"><input type="checkbox" checked={route.enabled} onChange={(event) => updateRoute(route.id, 'enabled', event.target.checked)} /><span>{route.enabled ? '启用' : '停用'}</span></label><button className="remove-btn" type="button" onClick={() => removeRoute(route.id)}>删除</button></div></div>)}</div></div> : null}

          {kind === 'distance' && rule ? <>
            <div className="config-card"><h3>起步价</h3><p className="config-card-note">用户先支付这一笔起步价；基础服务费和业务附加费已合并，不再拆分。</p><div className="config-fields"><NumberField label="起步价" value={money(startingFee(rule))} suffix="元" onChange={updateStartingFee} /><div className="pricing-readout"><span>当前起步价</span><strong>{money(startingFee(rule))} 元</strong></div></div></div>
            <div className="config-card"><h3>距离规则</h3><p className="config-card-note">起步距离可配置；超出后按整公里向上取整收费。没有封顶价格，超过最大服务距离直接提示超出范围。</p><div className="config-fields"><NumberField label="起步包含距离" value={(rule.includedDistanceMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => updateRule('includedDistanceMeters', String(Number(value || 0) * 1000))} /><NumberField label="超出每公里" value={money(rule.perKmFen)} suffix="元" onChange={(value) => updateRule('perKmFen', value)} /><NumberField label="最大服务距离" value={(rule.maxDistanceMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => updateRule('maxDistanceMeters', String(Number(value || 0) * 1000))} />{showsWeather ? <NumberField label="恶劣天气加价" value={money(rule.weatherSurchargeFen)} suffix="元/单" onChange={(value) => updateRule('weatherSurchargeFen', value)} /> : null}</div></div>
          </> : null}

          {kind === 'handling' && rule ? <>
            <div className="config-card"><h3>人工搬运服务费</h3><p className="config-card-note">搬运装卸只负责人工到现场搬、装、卸；如果还要把货物送到另一个地址，请选择“运货”，并在备注中说明装卸需求。</p><div className="config-fields"><NumberField label="固定人工服务费" value={money(startingFee(rule))} suffix="元" onChange={updateStartingFee} /><div className="pricing-readout"><span>当前服务起价</span><strong>{money(startingFee(rule))} 元</strong></div></div></div>
          </> : null}

    <div className="config-card preview-card"><div><span className="service-kicker">当前规则摘要</span><h3>{kind === 'parcel' ? '线路 × 物品 × 重量' : kind === 'route' ? '线路单价 × 乘客人数' : kind === 'handling' ? '固定上门服务费' : '起步价 + 距离费'}</h3></div><strong>{kind === 'parcel' ? (parcelReady ? '已配置' : '待配置') : kind === 'route' ? (routes.find((route) => route.enabled && route.unitPriceFen > 1) ? `${money(routes.find((route) => route.enabled && route.unitPriceFen > 1)?.unitPriceFen || 0)} 元起` : '待配置') : rule ? `${money(startingFee(rule))} 元起` : '待配置'}</strong></div>
        </> : <div className="empty">该业务尚未创建价格规则。</div>}
      </div>
    </div>
    <ConfigActions category="PRICING" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} />
  </section>
}

type ServiceAreaPayload = { areas: ServiceAreaConfig[]; serviceCities?: ServiceCityConfig[]; serviceIds?: string[]; policies: Array<{ serviceId: string; enforcementEnabled: boolean }> }

function serviceIdsFromAreas(areas: ServiceAreaConfig[] = []) {
  return Array.from(new Set(areas.flatMap((area) => area.serviceIds || area.bindings?.map((item) => item.serviceId) || [])))
}

function serviceCitiesFromPayload(payload: ServiceAreaPayload): ServiceCityConfig[] {
  if (Array.isArray(payload.serviceCities)) return payload.serviceCities
  return (payload.areas || []).map((area, index) => ({
    id: area.id,
    name: area.name,
    enabled: area.enabled !== false,
    serviceIds: area.serviceIds || area.bindings?.map((item) => item.serviceId) || [],
    sortOrder: area.sortOrder ?? index,
    version: area.version || 1,
  }))
}

function enabledServiceIds(cities: ServiceCityConfig[], fallback: string[]) {
  const ids = Array.from(new Set(cities.filter((city) => city.enabled).flatMap((city) => city.serviceIds || [])))
  return cities.length ? ids : fallback
}

export function ServiceAreasWorkspace({ api, onToast }: WorkspaceProps) {
  const [envelope, setEnvelope] = useState<ConfigEnvelope<ServiceAreaPayload> | null>(null)
  const [payload, setPayload] = useState<ServiceAreaPayload | null>(null)
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.getConfig<ServiceAreaPayload>('SERVICE_AREA').then((data) => {
      const next = clone(data.draft?.payload || data.live)
      const existingIds = Array.isArray(next.serviceIds) && next.serviceIds.length ? next.serviceIds : serviceIdsFromAreas(next.areas)
      const fallbackIds = existingIds.length ? existingIds : SERVICE_CATALOG.map((service) => service.id)
      next.areas = Array.isArray(next.areas) ? next.areas : []
      next.serviceCities = serviceCitiesFromPayload(next).map((city) => ({ ...city, serviceIds: city.serviceIds?.length ? city.serviceIds : fallbackIds }))
      next.serviceIds = fallbackIds
      next.policies = SERVICE_CATALOG.map((service) => data.draft?.payload?.policies?.find((policy) => policy.serviceId === service.id) || data.live?.policies?.find((policy) => policy.serviceId === service.id) || { serviceId: service.id, enforcementEnabled: false })
      setEnvelope(data)
      setPayload(next)
      setSelectedCityId(next.serviceCities[0]?.id || null)
      setLoading(false)
    }).catch((error) => {
      setLoading(false)
      onToast(`服务范围加载失败：${error instanceof Error ? error.message : '未知错误'}`)
    })
  }

  useEffect(load, [api])

  const live = envelope?.live
  const cities = payload?.serviceCities || []
  const activeCity = cities.find((city) => city.id === selectedCityId) || cities[0] || null
  const globalFallbackIds = payload?.serviceIds?.length ? payload.serviceIds : SERVICE_CATALOG.map((service) => service.id)
  const desiredPayload = payload ? { ...payload, serviceIds: enabledServiceIds(cities, globalFallbackIds) } : null
  const liveCities = live ? serviceCitiesFromPayload(live) : []
  const liveIds = live?.serviceIds?.length ? live.serviceIds : serviceIdsFromAreas(live?.areas)
  const normalizedLive = live ? { ...live, areas: live.areas || [], serviceCities: liveCities, serviceIds: liveIds.length ? liveIds : globalFallbackIds } : null
  const dirty = Boolean(envelope && desiredPayload && normalizedLive && JSON.stringify(desiredPayload) !== JSON.stringify(normalizedLive))
  const updateCity = (cityId: string, updates: Partial<ServiceCityConfig>) => {
    if (!payload) return
    setPayload({ ...payload, serviceCities: cities.map((city) => city.id === cityId ? { ...city, ...updates } : city) })
  }
  const updateCityService = (cityId: string, serviceId: string, enabled: boolean) => {
    const city = cities.find((item) => item.id === cityId)
    if (!city) return
    updateCity(cityId, { serviceIds: enabled ? Array.from(new Set([...city.serviceIds, serviceId])) : city.serviceIds.filter((item) => item !== serviceId) })
  }
  const addCity = () => {
    if (!payload) return
    const id = `city-${Date.now()}`
    const nextCity: ServiceCityConfig = { id, name: '新服务城市', enabled: true, serviceIds: globalFallbackIds, sortOrder: cities.length, version: 1 }
    setPayload({ ...payload, serviceCities: [...cities, nextCity] })
    setSelectedCityId(id)
  }
  const removeCity = (cityId: string) => {
    if (!payload) return
    const city = cities.find((item) => item.id === cityId)
    if (!city || !window.confirm(`移除“${city.name || '未命名城市'}”后，发布配置才会正式生效。确认移除？`)) return
    const nextCities = cities.filter((item) => item.id !== cityId)
    setPayload({ ...payload, serviceCities: nextCities })
    setSelectedCityId(nextCities[0]?.id || null)
  }
  const setAllCityServices = (cityId: string, enabled: boolean) => updateCity(cityId, { serviceIds: enabled ? SERVICE_CATALOG.map((service) => service.id) : [] })
  const save = async () => {
    if (!envelope || !desiredPayload) return
    setSaving(true)
    try { await api.saveConfigDraft('SERVICE_AREA', envelope.version, desiredPayload); onToast('服务城市草稿已保存'); load() } catch (error) { onToast(`保存失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setSaving(false) }
  }
  const publish = async () => {
    if (!dirty || !envelope || !desiredPayload) return
    if (!window.confirm('发布后新的服务城市和业务绑定会对新订单生效，历史订单不会变化。确认发布？')) return
    try { await api.saveConfigDraft('SERVICE_AREA', envelope.version, desiredPayload); await api.publishConfig('SERVICE_AREA'); onToast('服务城市配置已发布'); load() } catch (error) { onToast(`发布失败：${error instanceof Error ? error.message : '未知错误'}`) }
  }
  if (loading || !payload || !envelope) return <section className="config-page"><div className="empty">正在加载服务范围…</div></section>

  return <section className="config-page">
    <div className="config-heading area-heading"><div><p className="eyebrow">配置中心 · 03 / COVERAGE</p><h2>服务范围</h2><p className="muted">按城市管理可接单区域和业务能力，发布后同步到新的订单校验。</p></div><div className="area-heading-side"><div className="area-stat"><strong>{cities.filter((city) => city.enabled).length}</strong><span>启用城市</span></div><div className="area-stat"><strong>{new Set(cities.flatMap((city) => city.enabled ? city.serviceIds : [])).size}</strong><span>覆盖业务</span></div></div></div>
    <div className="config-main service-city-page">
      <div className="config-card city-overview-card"><div className="city-overview-heading"><div><span className="service-kicker">服务城市</span><h3>管理可接单城市</h3><p>一个城市可以独立启停，并选择该城市开放的业务。后续接入地图围栏时，可继续在城市下扩展精细边界。</p></div></div>
        <div className="city-workspace">
          <aside className="city-list" aria-label="服务城市列表"><div className="city-list-header"><div><span>城市列表</span><strong>{cities.length} 个</strong></div><button className="city-list-add" type="button" onClick={addCity}>+ 新增城市</button></div>{cities.length ? cities.map((city) => <button className={`city-list-item ${city.id === activeCity?.id ? 'active' : ''}`} type="button" key={city.id} onClick={() => setSelectedCityId(city.id)}><span className="city-list-icon">城</span><span className="city-list-copy"><strong>{city.name || '未命名城市'}</strong><small>{city.serviceIds.length} 项业务 · {city.enabled ? '接单中' : '已停用'}</small></span><i className={city.enabled ? 'on' : ''} /></button>) : <div className="city-empty"><span>＋</span><strong>还没有服务城市</strong><small>点击上方“新增城市”开始配置</small></div>}</aside>
          <div className="city-editor">{activeCity ? <><div className="city-editor-heading"><div><span className="service-kicker">城市配置</span><h3>{activeCity.name || '未命名城市'}</h3><p>设置城市名称、接单状态和可提供的业务。</p></div><button className="remove-btn" type="button" onClick={() => removeCity(activeCity.id)}>移除城市</button></div><div className="city-editor-fields"><label className="config-field city-name-field"><span>城市名称</span><input list="service-city-options" value={activeCity.name} onChange={(event) => updateCity(activeCity.id, { name: event.target.value })} placeholder="例如：宁德市" /><datalist id="service-city-options"><option value="宁德市" /><option value="福鼎市" /><option value="温州市" /><option value="苍南县" /><option value="福州市" /></datalist></label><label className={`city-status-toggle ${activeCity.enabled ? 'enabled' : ''}`}><input type="checkbox" checked={activeCity.enabled} onChange={(event) => updateCity(activeCity.id, { enabled: event.target.checked })} /><span className="city-status-track"><i /></span><span><strong>{activeCity.enabled ? '城市接单中' : '城市已停用'}</strong><small>{activeCity.enabled ? '新订单可以进入该城市' : '暂不向用户开放该城市'}</small></span></label></div><div className="city-service-section"><div className="city-service-heading"><div><span className="service-kicker">业务能力</span><strong>选择该城市开放的服务</strong><span>只影响该城市的新订单入口</span></div><div className="city-service-actions"><b>{activeCity.serviceIds.length}<small> / {SERVICE_CATALOG.length} 项</small></b><button type="button" onClick={() => setAllCityServices(activeCity.id, true)} disabled={activeCity.serviceIds.length === SERVICE_CATALOG.length}>全选</button><button type="button" onClick={() => setAllCityServices(activeCity.id, false)} disabled={!activeCity.serviceIds.length}>清空</button></div></div><div className="city-service-grid">{SERVICE_CATALOG.map((service) => { const selected = activeCity.serviceIds.includes(service.id); return <label className={`city-service-card ${selected ? 'selected' : ''}`} key={service.id}><input type="checkbox" checked={selected} onChange={(event) => updateCityService(activeCity.id, service.id, event.target.checked)} /><span className="city-service-icon">{service.icon}</span><span className="city-service-copy"><strong>{service.name}</strong><small>{service.subtitle}</small></span><i aria-hidden="true">{selected ? '✓' : ''}</i></label> })}</div></div><div className="city-editor-note"><span>i</span><span>城市配置会先保存为草稿，点击“发布变更”后才会影响新订单；历史订单和已生成报价不受影响。</span></div></> : <div className="city-empty city-empty-editor"><span>＋</span><strong>等待新增服务城市</strong><small>新增入口位于左侧“城市列表”标题旁</small></div>}</div>
        </div>
      </div>
    </div>
    <ConfigActions category="SERVICE_AREA" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} />
  </section>
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

  return <div className="config-card settings-card settings-card-password"><div className="settings-card-heading"><div className="settings-section-number">06</div><div><span className="settings-kicker">账户安全</span><h3>修改运营密码</h3><p>生产环境请使用密码管理器生成并保存至少 12 位随机密码。</p></div><span className="settings-card-badge">安全</span></div><div className="config-fields"><label className="config-field"><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="config-field"><span>新密码</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="config-field"><span>确认新密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></div><button className="light-btn password-submit" type="button" disabled={saving || !currentPassword || !newPassword || !confirmPassword} onClick={submit}>{saving ? '修改中…' : '修改密码'}</button></div>
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
  return <section className="config-page settings-page">
    <header className="settings-hero">
      <div>
        <p className="eyebrow">配置中心 · 03 / OPERATIONS</p>
        <div className="settings-title-row">
          <h2>系统设置</h2>
          <span className={`status-pill ${settings.acceptingOrders ? 'online' : ''}`}><i aria-hidden="true" />{settings.acceptingOrders ? '营业中' : '已暂停接单'}</span>
        </div>
        <p className="muted">把营业状态、用户沟通和骑手履约边界集中在一个清晰的控制面板里。</p>
      </div>
      <div className="settings-hero-meta"><span>当前版本</span><strong>v{envelope.version}</strong><small>发布后立即生效 · 历史订单不受影响</small></div>
    </header>

    <section className="settings-overview" aria-label="设置概览">
      <div className={`overview-card overview-status ${settings.acceptingOrders ? 'is-online' : 'is-paused'}`}><span className="overview-icon">{settings.acceptingOrders ? '↗' : 'Ⅱ'}</span><div><span>接单状态</span><strong>{settings.acceptingOrders ? '接受新订单' : '暂停接单'}</strong></div><small>{settings.acceptingOrders ? '新报价和新订单正常进入' : '已有订单继续履约'}</small></div>
      <div className="overview-card"><span className="overview-icon neutral">⌁</span><div><span>报价有效期</span><strong>{settings.quoteValidityMinutes} 分钟</strong></div><small>超时后用户需要重新询价</small></div>
      <div className="overview-card"><span className="overview-icon neutral">◎</span><div><span>骑手调度半径</span><strong>{(settings.riderOrderRadiusMeters / 1000).toFixed(1)} 公里</strong></div><small>用于匹配附近可接单骑手</small></div>
    </section>

    <div className="settings-grid">
      <div className="config-card settings-card settings-card-status">
        <div className="settings-card-heading"><div className="settings-section-number">01</div><div><span className="settings-kicker">营业开关</span><h3>营业状态</h3><p>暂停只影响新报价和新订单，已有订单继续履约。</p></div><label className="settings-switch"><input type="checkbox" checked={settings.acceptingOrders} onChange={(event) => update({ acceptingOrders: event.target.checked })} /><span className="settings-switch-track"><i /></span><strong>{settings.acceptingOrders ? '接受新订单' : '暂停接单'}</strong></label></div>
        <div className={`settings-state-banner ${settings.acceptingOrders ? 'is-online' : 'is-paused'}`}><span className="state-dot" /><div><strong>{settings.acceptingOrders ? '当前正在营业' : '当前已暂停接单'}</strong><p>{settings.acceptingOrders ? '系统会继续接收新的商家订单和用户报价请求。' : '恢复营业后，新的报价和订单会重新进入履约流程。'}</p></div></div>
        <label className="config-field"><span>暂停原因 <em>仅在暂停时展示给运营人员</em></span><input value={settings.closureReason} onChange={(event) => update({ closureReason: event.target.value })} placeholder="例如：恶劣天气临时暂停" /></label>
      </div>

      <div className="config-card settings-card settings-card-announcement">
        <div className="settings-card-heading"><div className="settings-section-number">02</div><div><span className="settings-kicker">用户沟通</span><h3>客服与公告</h3><p>把重要信息及时同步到用户端。</p></div><label className="settings-switch compact"><input type="checkbox" checked={settings.announcementEnabled} onChange={(event) => update({ announcementEnabled: event.target.checked })} /><span className="settings-switch-track"><i /></span><strong>{settings.announcementEnabled ? '已展示' : '未展示'}</strong></label></div>
        <div className="settings-fields-two"><label className="config-field"><span>客服电话</span><input value={settings.customerServicePhone} onChange={(event) => update({ customerServicePhone: event.target.value })} placeholder="0593-8888888" /></label><label className="config-field"><span>公告标题</span><input value={settings.announcementTitle} onChange={(event) => update({ announcementTitle: event.target.value })} /></label></div>
        <label className="config-field"><span>公告内容</span><textarea value={settings.announcementContent} onChange={(event) => update({ announcementContent: event.target.value })} rows={3} placeholder="输入用户需要知道的服务信息" /></label>
        <div className="announcement-hint"><span className="hint-icon">i</span><span>{settings.announcementEnabled ? '公告将在用户端首页展示。' : '开启“已展示”后，公告才会对用户可见。'}</span></div>
      </div>

      <div className="config-card settings-card settings-card-quote">
        <div className="settings-card-heading"><div className="settings-section-number">03</div><div><span className="settings-kicker">订单策略</span><h3>报价与取消</h3><p>控制报价在用户侧的有效时间。</p></div></div>
        <div className="settings-single-field"><NumberField label="报价有效期" value={settings.quoteValidityMinutes} suffix="分钟" onChange={(value) => update({ quoteValidityMinutes: Number(value || 10) })} step="1" /></div>
        <label className="settings-check-row"><input type="checkbox" checked={settings.allowCancelBeforeClaim} onChange={(event) => update({ allowCancelBeforeClaim: event.target.checked })} /><span><strong>允许用户自助取消</strong><small>骑手接单前，用户可以自行取消订单</small></span></label>
      </div>

      <div className="config-card settings-card settings-card-rider">
        <div className="settings-card-heading"><div className="settings-section-number">04</div><div><span className="settings-kicker">履约边界</span><h3>骑手调度</h3><p>决定订单如何分发给附近骑手。</p></div></div>
        <div className="settings-fields-two"><NumberField label="抢单半径" value={(settings.riderOrderRadiusMeters / 1000).toFixed(1)} suffix="公里" onChange={(value) => update({ riderOrderRadiusMeters: Number(value || 30) * 1000 })} /><NumberField label="最大进行中订单" value={settings.riderMaxActiveOrders} suffix="单" onChange={(value) => update({ riderMaxActiveOrders: Number(value || 1) })} step="1" /></div>
        <div className="settings-note"><span className="hint-icon">⌖</span><span>半径越大，订单覆盖的骑手范围越广；进行中订单上限用于避免超负荷接单。</span></div>
      </div>

      <div className="config-card settings-card settings-card-hours">
        <div className="settings-card-heading"><div className="settings-section-number">05</div><div><span className="settings-kicker">服务时间</span><h3>每周营业时间</h3><p>设置用户可提交新订单的时间段。</p></div><span className="settings-card-badge">7 天</span></div>
        <div className="hours-grid settings-hours-grid">{['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, day) => <label key={label}><span>{label}</span><input aria-label={`${label}开始时间`} value={hours[String(day)]?.[0]?.start || '00:00'} onChange={(event) => update({ weeklyHours: { ...hours, [String(day)]: [{ ...(hours[String(day)]?.[0] || {}), start: event.target.value }] } })} /><b>至</b><input aria-label={`${label}结束时间`} value={hours[String(day)]?.[0]?.end || '24:00'} onChange={(event) => update({ weeklyHours: { ...hours, [String(day)]: [{ ...(hours[String(day)]?.[0] || {}), end: event.target.value }] } })} /></label>)}</div>
      </div>

      <PasswordChangeCard api={api} onToast={onToast} />
    </div>
    <ConfigActions category="SYSTEM" version={envelope.version} dirty={dirty} saving={saving} onSave={save} onPublish={publish} />
  </section>
}
