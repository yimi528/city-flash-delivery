const documents = {
  terms: {
    title: '法律条款',
    intro: '请在使用服务前阅读以下规则。正式发布前，运营主体应结合实际经营模式完成法律审核。',
    tabs: [
      { key: 'terms', label: '用户协议' },
      { key: 'privacy', label: '隐私政策' }
    ]
  },
  qualification: {
    title: '平台资质',
    intro: '以下信息用于公开平台运营主体和备案状态，未完成的项目不会显示为已取得。',
    tabs: [{ key: 'qualification', label: '资质信息' }]
  }
}

const content = {
  terms: [
    { title: '服务说明', body: '平台提供寄货、运货、搬运装卸、帮取、帮买等信息与履约服务。具体服务范围、费用和预计时间以下单页及订单确认信息为准。' },
    { title: '订单与费用', body: '用户应提供真实、准确的联系人、地址和物品信息。平台报价确认后方可支付；订单取消、退款和附加费用按照下单时展示的规则处理。' },
    { title: '禁止寄送', body: '不得寄送法律法规禁止流通、运输或存在危险性的物品。用户隐瞒物品性质造成损失的，应依法承担相应责任。' },
    { title: '异常与售后', body: '出现延误、损坏、遗失或其他异常时，请保留订单、物品和沟通凭证并通过客服入口发起处理。' },
    { title: '规则更新', body: '平台会在法律法规、业务或产品发生变化时更新协议，并以页面提示等合理方式通知用户。' }
  ],
  privacy: [
    { title: '收集的信息', body: '为完成登录、下单和履约，平台可能处理微信账号标识、联系人、手机号、收发货地址、定位、订单和支付状态。' },
    { title: '使用目的', body: '相关信息仅用于账号登录、地址搜索、距离计算、订单履约、客服售后、安全风控和法律法规要求的处理。' },
    { title: '位置权限', body: '只有在用户主动定位、搜索附近地址或骑手上线时申请位置权限；拒绝授权后仍可手动填写地址，但部分距离或附近服务功能可能不可用。' },
    { title: '共享与保存', body: '履约所必需的信息会提供给实际承运或服务人员。平台按照最短必要期限保存信息，并采取访问控制、加密和日志审计等保护措施。' },
    { title: '用户权利', body: '用户可以查询、更正或删除地址等个人信息，并可申请注销账号、撤回非必要授权或提出个人信息相关请求。正式客服联系方式将在上线前公布。' }
  ],
  qualification: [
    { title: '运营主体', body: '待配置：企业名称、统一社会信用代码和注册地址。' },
    { title: '互联网备案', body: '待配置：网站 ICP 备案号及微信小程序备案号。' },
    { title: '平台与运输资质', body: '待核验：根据实际寄递、货运和拼车经营模式，公开适用的许可证名称、编号、经营区域和有效期。' },
    { title: '服务监督', body: '待配置：客服电话、服务时间、投诉渠道和经营地址。' },
    { title: '特别提示', body: '“待配置”表示平台尚未在本页面声明已取得该项资质，不代表已经取得许可。完成主管部门核验后再替换为正式信息。' }
  ]
}

Page({
  data: {
    statusBarHeight: 24,
    title: '平台信息',
    intro: '',
    tabs: [],
    active: 'terms',
    sections: []
  },

  onLoad(query) {
    const type = query.type === 'qualification' ? 'qualification' : 'terms'
    const document = documents[type]
    this.setData({
      statusBarHeight: (getApp().globalData || {}).statusBarHeight || 24,
      title: document.title,
      intro: document.intro,
      tabs: document.tabs,
      active: document.tabs[0].key,
      sections: content[document.tabs[0].key]
    })
  },

  switchTab(event) {
    const active = event.currentTarget.dataset.key
    if (!content[active]) return
    this.setData({ active, sections: content[active] })
  },

  goBack() {
    wx.navigateBack()
  }
})
