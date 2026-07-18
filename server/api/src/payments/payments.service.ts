import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  OrderStatus,
  PaymentRecordStatus,
  PaymentStatus,
  Prisma,
  QuoteStatus,
} from '@prisma/client'
import { createDecipheriv, randomBytes, sign, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { PrismaService } from '../common/prisma/prisma.service'

type NotificationHeaders = {
  timestamp: string
  nonce: string
  signature: string
  serial: string
}

type WechatPrepayResponse = {
  prepay_id?: string
  code?: string
  message?: string
}

type WechatNotification = {
  event_type?: string
  resource?: {
    algorithm?: string
    ciphertext?: string
    associated_data?: string
    nonce?: string
  }
}

type WechatTransaction = {
  out_trade_no: string
  transaction_id?: string
  trade_state?: string
  payer?: { openid?: string }
  amount?: { total?: number }
}

type WechatRefund = {
  out_refund_no: string
  transaction_id?: string
  refund_id?: string
  refund_status?: 'SUCCESS' | 'CLOSED' | 'PROCESSING' | 'ABNORMAL' | string
  success_time?: string
  amount?: { refund?: number; total?: number }
}

type TradeBillRow = Record<string, string>

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name)
  private reconciliationTimer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.paymentMode() === 'wechat' && this.config.get<string>('WECHAT_PAY_AUTO_RECONCILIATION_ENABLED') === 'true') {
      this.scheduleReconciliation()
    }
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearTimeout(this.reconciliationTimer)
  }

  async createPrepay(orderId: string, userId: string) {
    const order = await this.findOrder(orderId, userId)
    if (order.status === OrderStatus.CANCELLED) throw new ConflictException('已取消订单不能支付')
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { mode: 'paid', orderId: order.id, paymentStatus: PaymentStatus.PAID }
    }
    if (order.isManualQuote && order.quoteStatus !== QuoteStatus.ACCEPTED) {
      throw new ConflictException('请先确认商家最终报价再支付')
    }

    const amountFen = order.totalFeeFen || Math.round(Number(order.totalFee) * 100)
    if (amountFen <= 0) throw new ConflictException('订单支付金额无效')
    const paymentMode = this.paymentMode()
    if (paymentMode === 'disabled') {
      throw new ServiceUnavailableException('暂未开通在线支付，请联系商家确认付款方式')
    }
    const mockEnabled = this.isMockPaymentEnabled()
    if (!mockEnabled && !order.user.openid)
      throw new ConflictException('当前用户缺少微信 openid，请重新登录')

    const outTradeNo = order.payment?.outTradeNo || this.createOutTradeNo()
    const payerOpenid = order.user.openid || 'mock-openid-demo-user'
    if (mockEnabled) {
      const payment = await this.prisma.paymentRecord.upsert({
        where: { orderId: order.id },
        update: { amountFen, payerOpenid, status: PaymentRecordStatus.PENDING },
        create: {
          orderId: order.id,
          outTradeNo,
          amountFen,
          payerOpenid,
          status: PaymentRecordStatus.PENDING,
        },
      })
      return { mode: 'mock', orderId: order.id, paymentId: payment.id, amountFen }
    }

    const prepayId =
      order.payment?.prepayId ||
      (await this.requestWechatPrepay({
        outTradeNo,
        description: `${order.serviceName || '同城配送'}-${order.orderNo}`.slice(0, 127),
        amountFen,
        payerOpenid,
      }))
    const payment = await this.prisma.paymentRecord.upsert({
      where: { orderId: order.id },
      update: { amountFen, payerOpenid, prepayId, status: PaymentRecordStatus.PENDING },
      create: {
        orderId: order.id,
        outTradeNo,
        amountFen,
        payerOpenid,
        prepayId,
        status: PaymentRecordStatus.PENDING,
      },
    })
    return {
      mode: 'wechat',
      orderId: order.id,
      paymentId: payment.id,
      amountFen,
      params: this.buildMiniProgramPaymentParams(prepayId),
    }
  }

  async getPayment(orderId: string, userId: string) {
    const order = await this.findOrder(orderId, userId)
    return {
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      payment: order.payment
        ? {
            status: order.payment.status,
            amountFen: order.payment.amountFen,
            paidAt: order.payment.paidAt,
            refund: order.payment.refunds[0]
              ? {
                  status: order.payment.refunds[0].status,
                  outRefundNo: order.payment.refunds[0].outRefundNo,
                  amountFen: order.payment.refunds[0].amountFen,
                  successAt: order.payment.refunds[0].successAt,
                  lastError: order.payment.refunds[0].lastError,
                }
              : null,
          }
        : null,
    }
  }

  async confirmMockPayment(orderId: string, userId: string) {
    if (!this.isMockPaymentEnabled())
      throw new ForbiddenException('模拟支付只允许在测试阶段使用')
    const order = await this.findOrder(orderId, userId)
    if (order.status === OrderStatus.CANCELLED) throw new ConflictException('已取消订单不能支付')
    if (!order.payment) throw new ConflictException('请先创建预支付订单')
    await this.prisma.$transaction([
      this.prisma.paymentRecord.update({
        where: { id: order.payment.id },
        data: {
          status: PaymentRecordStatus.SUCCEEDED,
          paidAt: new Date(),
          transactionId: `MOCK-${Date.now()}`,
        },
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.PAID },
      }),
      this.prisma.outboxEvent.create({
        data: {
          aggregateId: order.id,
          eventType: 'ORDER_AVAILABLE',
          payload: { orderId: order.id, taskId: order.taskId, vehicleType: order.vehicleType },
        },
      }),
    ])
    return { orderId: order.id, paymentStatus: PaymentStatus.PAID, mode: 'mock' }
  }

  async handleWechatNotification(rawBody: string, headers: NotificationHeaders) {
    if (!rawBody || !headers.timestamp || !headers.nonce || !headers.signature || !headers.serial) {
      throw new UnauthorizedException('微信支付回调缺少验签信息')
    }
    this.verifyWechatNotification(rawBody, headers)
    const notification = JSON.parse(rawBody) as WechatNotification
    const transaction = this.decryptWechatResource(notification.resource)
    const payment = await this.prisma.paymentRecord.findUnique({
      where: { outTradeNo: transaction.out_trade_no },
    })
    if (!payment) throw new NotFoundException('支付订单不存在')
    if (Number(transaction.amount?.total) !== payment.amountFen)
      throw new ConflictException('支付金额校验失败')
    if (payment.status === PaymentRecordStatus.SUCCEEDED)
      return { code: 'SUCCESS', message: '成功' }

    if (transaction.trade_state === 'SUCCESS') {
      await this.prisma.$transaction([
        this.prisma.paymentRecord.update({
          where: { id: payment.id },
          data: {
            status: PaymentRecordStatus.SUCCEEDED,
            transactionId: transaction.transaction_id || '',
            payerOpenid: transaction.payer?.openid || payment.payerOpenid,
            rawNotify: notification as Prisma.InputJsonValue,
            paidAt: new Date(),
          },
        }),
        this.prisma.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: PaymentStatus.PAID },
        }),
        this.prisma.outboxEvent.create({
          data: {
            aggregateId: payment.orderId,
            eventType: 'ORDER_AVAILABLE',
            payload: { orderId: payment.orderId },
          },
        }),
      ])
    }
    return { code: 'SUCCESS', message: '成功' }
  }

  async handleWechatRefundNotification(rawBody: string, headers: NotificationHeaders) {
    if (!rawBody || !headers.timestamp || !headers.nonce || !headers.signature || !headers.serial) {
      throw new UnauthorizedException('微信退款回调缺少验签信息')
    }
    this.verifyWechatNotification(rawBody, headers)
    const notification = JSON.parse(rawBody) as WechatNotification
    const refund = this.decryptWechatResource(notification.resource) as unknown as WechatRefund
    if (!refund.out_refund_no || !refund.amount?.refund)
      throw new UnauthorizedException('微信退款回调数据不完整')

    const refundRecord = await this.prisma.refundRecord.findUnique({
      where: { outRefundNo: refund.out_refund_no },
    })
    if (!refundRecord) throw new NotFoundException('退款订单不存在')
    if (Number(refund.amount.refund) !== refundRecord.amountFen)
      throw new ConflictException('退款金额校验失败')
    if (refundRecord.status === 'SUCCEEDED') return { code: 'SUCCESS', message: '成功' }

    const status = this.mapWechatRefundStatus(refund.refund_status)
    await this.persistRefundResult(refundRecord.id, status, refund, notification)
    return { code: 'SUCCESS', message: '成功' }
  }

  async refundForCancellation(orderId: string, userId: string) {
    const order = await this.findOrder(orderId, userId)
    if (order.paymentStatus === PaymentStatus.REFUNDED)
      return { paymentStatus: PaymentStatus.REFUNDED }
    if (
      order.paymentStatus !== PaymentStatus.PAID &&
      order.paymentStatus !== PaymentStatus.REFUNDING
    ) {
      throw new ConflictException('订单尚未完成支付，不能退款')
    }
    const payment = order.payment
    if (!payment) throw new ConflictException('支付记录不存在，无法退款')
    if (payment.transactionId.startsWith('MOCK-')) {
      await this.prisma.paymentRecord.update({
        where: { id: payment.id },
        data: { status: PaymentRecordStatus.REFUNDED },
      })
      return { paymentStatus: PaymentStatus.REFUNDED }
    }
    if (
      (payment.status !== PaymentRecordStatus.SUCCEEDED &&
        payment.status !== PaymentRecordStatus.REFUNDING &&
        payment.status !== PaymentRecordStatus.FAILED) ||
      !payment.transactionId
    ) {
      throw new ConflictException('支付交易号缺失，无法发起微信退款')
    }

    let refundRecord = await this.prisma.refundRecord.findUnique({ where: { orderId: order.id } })
    if (refundRecord?.status === 'SUCCEEDED') return { paymentStatus: PaymentStatus.REFUNDED }
    if (refundRecord?.status === 'PROCESSING') return { paymentStatus: PaymentStatus.REFUNDING }
    const outRefundNo = refundRecord?.outRefundNo || this.createRefundNo(order.orderNo)
    refundRecord = await this.prisma.refundRecord.upsert({
      where: { orderId: order.id },
      update: {
        status: 'CREATED',
        lastError: '',
        retryCount: refundRecord ? { increment: 1 } : undefined,
      },
      create: {
        paymentId: payment.id,
        orderId: order.id,
        outRefundNo,
        amountFen: payment.amountFen,
        reason: '用户取消订单',
        status: 'CREATED',
      },
    })

    let result: WechatRefund
    try {
      result = await this.requestWechatRefund({
        transactionId: payment.transactionId,
        outRefundNo: refundRecord.outRefundNo,
        amountFen: payment.amountFen,
        reason: refundRecord.reason,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '微信退款请求失败'
      await this.prisma.refundRecord.update({
        where: { id: refundRecord.id },
        data: { status: 'FAILED', lastError: message.slice(0, 500) },
      })
      throw error
    }

    const status = this.mapWechatRefundStatus(result.refund_status)
    await this.persistRefundResult(refundRecord.id, status, result)
    if (status === 'FAILED') throw new ConflictException('微信退款未成功，请稍后重试')
    return {
      paymentStatus: status === 'SUCCEEDED' ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING,
    }
  }

  async closePendingPayment(orderId: string) {
    const payment = await this.prisma.paymentRecord.findUnique({ where: { orderId } })
    if (
      !payment ||
      (payment.status !== PaymentRecordStatus.CREATED &&
        payment.status !== PaymentRecordStatus.PENDING)
    )
      return
    if (
      payment.outTradeNo &&
      !payment.transactionId.startsWith('MOCK-') &&
      !this.isMockPaymentEnabled()
    ) {
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(payment.outTradeNo)}/close`
      await this.requestWechatApi('POST', path, { mchid: this.required('WECHAT_PAY_MCH_ID') }, true)
    }
    await this.prisma.paymentRecord.update({
      where: { id: payment.id },
      data: { status: PaymentRecordStatus.CLOSED },
    })
  }

  async downloadTradeBill(billDate?: string) {
    const date = this.normaliseBillDate(billDate)
    const path = `/v3/bill/tradebill?bill_date=${date}&tar_type=GZIP`
    const response = await this.requestWechatApi('GET', path)
    const metadata = JSON.parse(await response.text()) as {
      download_url?: string
      hash_value?: string
      hash_type?: string
    }
    if (!metadata.download_url) throw new BadGatewayException('微信交易账单下载地址缺失')

    const downloadUrl = new URL(metadata.download_url)
    const downloadPath = `${downloadUrl.pathname}${downloadUrl.search}`
    const downloadResponse = await this.requestWechatApi(
      'GET',
      downloadPath,
      undefined,
      false,
      undefined,
      false,
    )
    const compressed = Buffer.from(await downloadResponse.arrayBuffer())
    const content =
      compressed[0] === 0x1f && compressed[1] === 0x8b
        ? gunzipSync(compressed).toString('utf8')
        : compressed.toString('utf8')
    return {
      billDate: date,
      hashValue: metadata.hash_value || '',
      hashType: metadata.hash_type || '',
      records: this.parseTradeBill(content),
    }
  }

  async reconcileTradeBill(billDate?: string) {
    const bill = await this.downloadTradeBill(billDate)
    const date = new Date(`${bill.billDate}T00:00:00.000Z`)
    const counts: Record<string, number> = {
      MATCHED: 0,
      MISSING_LOCAL: 0,
      AMOUNT_MISMATCH: 0,
      REFUND_MISMATCH: 0,
    }
    for (const row of bill.records) {
      const outTradeNo = row['商户订单号'] || ''
      if (!outTradeNo || outTradeNo === '总计') continue
      const amountFen = this.parseMoneyFen(row['订单金额'] || row['应结订单金额'])
      const refundAmountFen = this.parseMoneyFen(row['退款金额'] || row['申请退款金额'])
      const payment = await this.prisma.paymentRecord.findUnique({ where: { outTradeNo } })
      const status: 'MATCHED' | 'MISSING_LOCAL' | 'AMOUNT_MISMATCH' | 'REFUND_MISMATCH' = !payment
        ? 'MISSING_LOCAL'
        : payment.amountFen !== amountFen
          ? 'AMOUNT_MISMATCH'
          : refundAmountFen > 0 &&
              payment.status !== PaymentRecordStatus.REFUNDED &&
              payment.status !== PaymentRecordStatus.REFUNDING
            ? 'REFUND_MISMATCH'
            : 'MATCHED'
      counts[status] += 1
      await this.prisma.paymentReconciliation.upsert({
        where: { billDate_outTradeNo: { billDate: date, outTradeNo } },
        update: {
          transactionId: row['微信订单号'] || '',
          tradeState: row['交易状态'] || '',
          amountFen,
          refundAmountFen,
          status,
          paymentId: payment?.id || null,
          rawBill: row as Prisma.InputJsonValue,
          reconciledAt: new Date(),
        },
        create: {
          billDate: date,
          outTradeNo,
          transactionId: row['微信订单号'] || '',
          tradeState: row['交易状态'] || '',
          amountFen,
          refundAmountFen,
          status,
          paymentId: payment?.id || null,
          rawBill: row as Prisma.InputJsonValue,
        },
      })
    }
    return { billDate: bill.billDate, total: bill.records.length, counts }
  }

  async listReconciliation(status?: string) {
    const validStatuses = ['MATCHED', 'MISSING_LOCAL', 'AMOUNT_MISMATCH', 'REFUND_MISMATCH']
    const where =
      status && validStatuses.includes(status)
        ? { status: status as 'MATCHED' | 'MISSING_LOCAL' | 'AMOUNT_MISMATCH' | 'REFUND_MISMATCH' }
        : undefined
    return this.prisma.paymentReconciliation.findMany({
      where,
      orderBy: { reconciledAt: 'desc' },
      take: 200,
    })
  }

  private async findOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNo: orderId }] },
      include: { user: true, payment: { include: { refunds: true } } },
    })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== userId) throw new ForbiddenException('无权支付该订单')
    return order
  }

  private async requestWechatPrepay(input: {
    outTradeNo: string
    description: string
    amountFen: number
    payerOpenid: string
  }) {
    const path = '/v3/pay/transactions/jsapi'
    const body = JSON.stringify({
      appid: this.required('WECHAT_MINI_APP_ID'),
      mchid: this.required('WECHAT_PAY_MCH_ID'),
      description: input.description,
      out_trade_no: input.outTradeNo,
      notify_url: this.required('WECHAT_PAY_NOTIFY_URL'),
      amount: { total: input.amountFen, currency: 'CNY' },
      payer: { openid: input.payerOpenid },
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString('hex')
    const message = `POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`
    const signature = this.rsaSign(message)
    const authorization = [
      `mchid="${this.required('WECHAT_PAY_MCH_ID')}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${this.required('WECHAT_PAY_CERT_SERIAL')}"`,
      `signature="${signature}"`,
    ].join(',')

    const response = await this.requestWechatApi('POST', path, JSON.parse(body), false, {
      timestamp,
      nonce,
      authorization,
    })
    const rawResponse = await response.text()
    if (response.ok) {
      this.verifyWechatResponse(rawResponse, {
        timestamp: response.headers.get('wechatpay-timestamp') || '',
        nonce: response.headers.get('wechatpay-nonce') || '',
        signature: response.headers.get('wechatpay-signature') || '',
        serial: response.headers.get('wechatpay-serial') || '',
      })
    }
    const data = JSON.parse(rawResponse || '{}') as WechatPrepayResponse
    if (!response.ok || !data.prepay_id) {
      throw new BadGatewayException(data.message || data.code || '微信支付下单失败')
    }
    return data.prepay_id
  }

  private async requestWechatRefund(input: {
    transactionId: string
    outRefundNo: string
    amountFen: number
    reason: string
  }) {
    const path = '/v3/refund/domestic/refunds'
    const response = await this.requestWechatApi('POST', path, {
      transaction_id: input.transactionId,
      out_refund_no: input.outRefundNo,
      reason: input.reason.slice(0, 80),
      notify_url: this.required('WECHAT_PAY_REFUND_NOTIFY_URL'),
      amount: { refund: input.amountFen, total: input.amountFen, currency: 'CNY' },
    })
    const data = JSON.parse((await response.text()) || '{}') as WechatRefund & {
      code?: string
      message?: string
    }
    if (!response.ok || !data.out_refund_no)
      throw new BadGatewayException(data.message || data.code || '微信退款失败')
    return data
  }

  private async requestWechatApi(
    method: string,
    path: string,
    payload?: Record<string, unknown>,
    allowNoContent = false,
    existingSignature?: { timestamp: string; nonce: string; authorization: string },
    verifyResponse = true,
  ) {
    const body = payload ? JSON.stringify(payload) : ''
    const timestamp = existingSignature?.timestamp || String(Math.floor(Date.now() / 1000))
    const nonce = existingSignature?.nonce || randomBytes(16).toString('hex')
    const authorization =
      existingSignature?.authorization ||
      this.buildAuthorization(method, path, timestamp, nonce, body)
    let response: Response
    try {
      response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `WECHATPAY2-SHA256-RSA2048 ${authorization}`,
        },
        body: body || undefined,
      })
    } catch {
      throw new BadGatewayException('微信支付服务暂时不可用')
    }
    const rawResponse = verifyResponse || !response.ok ? await response.clone().text() : ''
    if (verifyResponse && response.ok && rawResponse) {
      this.verifyWechatResponse(rawResponse, {
        timestamp: response.headers.get('wechatpay-timestamp') || '',
        nonce: response.headers.get('wechatpay-nonce') || '',
        signature: response.headers.get('wechatpay-signature') || '',
        serial: response.headers.get('wechatpay-serial') || '',
      })
    }
    if (!response.ok && !(allowNoContent && response.status === 204)) {
      const data = JSON.parse(rawResponse || '{}') as { message?: string; code?: string }
      throw new BadGatewayException(data.message || data.code || '微信支付请求失败')
    }
    return response
  }

  private buildAuthorization(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body: string,
  ) {
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`
    return [
      `mchid="${this.required('WECHAT_PAY_MCH_ID')}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${this.required('WECHAT_PAY_CERT_SERIAL')}"`,
      `signature="${this.rsaSign(message)}"`,
    ].join(',')
  }

  private buildMiniProgramPaymentParams(prepayId: string) {
    const timeStamp = String(Math.floor(Date.now() / 1000))
    const nonceStr = randomBytes(16).toString('hex')
    const packageValue = `prepay_id=${prepayId}`
    const message = `${this.required('WECHAT_MINI_APP_ID')}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`
    return {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: 'RSA',
      paySign: this.rsaSign(message),
    }
  }

  private verifyWechatNotification(rawBody: string, headers: NotificationHeaders) {
    const timestamp = Number(headers.timestamp)
    if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
      throw new UnauthorizedException('微信支付回调时间戳无效')
    }
    this.verifyWechatResponse(rawBody, headers)
  }

  private verifyWechatResponse(body: string, headers: NotificationHeaders) {
    if (!headers.timestamp || !headers.nonce || !headers.signature || !headers.serial) {
      throw new UnauthorizedException('微信支付响应缺少验签信息')
    }
    const configuredSerial = this.config.get<string>('WECHAT_PAY_PLATFORM_CERT_SERIAL') || ''
    if (configuredSerial && configuredSerial !== headers.serial) {
      throw new UnauthorizedException('微信支付平台证书序列号不匹配')
    }
    const message = `${headers.timestamp}\n${headers.nonce}\n${body}\n`
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(message),
      this.loadPem('WECHAT_PAY_PLATFORM_CERT_PATH', 'WECHAT_PAY_PLATFORM_CERT'),
      Buffer.from(headers.signature, 'base64'),
    )
    if (!valid) throw new UnauthorizedException('微信支付回调验签失败')
  }

  private decryptWechatResource(resource?: WechatNotification['resource']) {
    if (!resource?.ciphertext || !resource.nonce)
      throw new UnauthorizedException('微信支付回调数据不完整')
    const apiV3Key = this.required('WECHAT_PAY_API_V3_KEY')
    if (Buffer.byteLength(apiV3Key) !== 32)
      throw new ServiceUnavailableException('WECHAT_PAY_API_V3_KEY 必须为 32 字节')
    const encrypted = Buffer.from(resource.ciphertext, 'base64')
    const authTag = encrypted.subarray(encrypted.length - 16)
    const ciphertext = encrypted.subarray(0, encrypted.length - 16)
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key),
      Buffer.from(resource.nonce),
    )
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(resource.associated_data || ''))
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    )
    return JSON.parse(plaintext) as WechatTransaction
  }

  private rsaSign(message: string) {
    return sign(
      'RSA-SHA256',
      Buffer.from(message),
      this.loadPem('WECHAT_PAY_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY'),
    ).toString('base64')
  }

  private loadPem(pathKey: string, inlineKey: string) {
    const path = this.config.get<string>(pathKey) || ''
    if (path) return readFileSync(path, 'utf8')
    const inline = this.config.get<string>(inlineKey) || ''
    if (inline) return inline.replace(/\\n/g, '\n')
    throw new ServiceUnavailableException(`${pathKey} or ${inlineKey} must be configured`)
  }

  private required(key: string) {
    const value = this.config.get<string>(key) || ''
    if (!value) throw new ServiceUnavailableException(`${key} must be configured`)
    return value
  }

  private createOutTradeNo() {
    return `CF${Date.now()}${randomBytes(5).toString('hex')}`.slice(0, 32)
  }

  private createRefundNo(orderNo: string) {
    return `RF${orderNo}${randomBytes(4).toString('hex')}`.slice(0, 64)
  }

  private scheduleReconciliation() {
    const now = new Date()
    const nextRun = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 3, 30),
    )
    this.reconciliationTimer = setTimeout(
      () => {
        void this.reconcileTradeBill()
          .catch((error) => {
            this.logger.error(
              `微信交易账单自动对账失败: ${error instanceof Error ? error.message : String(error)}`,
            )
          })
          .finally(() => this.scheduleReconciliation())
      },
      Math.max(nextRun.getTime() - now.getTime(), 1000),
    )
  }

  private normaliseBillDate(value?: string) {
    const date = value || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
      throw new ConflictException('账单日期必须为 YYYY-MM-DD')
    }
    return date
  }

  private parseTradeBill(content: string): TradeBillRow[] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim())
    const headerIndex = lines.findIndex((line) => line.includes('商户订单号'))
    if (headerIndex < 0) return []
    const headers = this.parseCsvLine(lines[headerIndex])
    return lines
      .slice(headerIndex + 1)
      .map((line) => this.parseCsvLine(line))
      .filter((values) => values.length > 1)
      .map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])),
      )
  }

  private parseCsvLine(line: string) {
    const values: string[] = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"' && line[index + 1] === '"' && quoted) {
        value += '"'
        index += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (char === ',' && !quoted) {
        values.push(value.trim())
        value = ''
      } else {
        value += char
      }
    }
    values.push(value.trim())
    return values
  }

  private parseMoneyFen(value?: string) {
    const normalised = String(value || '').replace(/[￥,\s]/g, '')
    const amount = Number(normalised)
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0
  }

  private mapWechatRefundStatus(status?: string) {
    if (status === 'SUCCESS') return 'SUCCEEDED' as const
    if (status === 'PROCESSING') return 'PROCESSING' as const
    return 'FAILED' as const
  }

  private async persistRefundResult(
    refundId: string,
    status: 'SUCCEEDED' | 'PROCESSING' | 'FAILED',
    refund: WechatRefund,
    rawNotify?: WechatNotification,
  ) {
    const succeeded = status === 'SUCCEEDED'
    await this.prisma.$transaction([
      this.prisma.refundRecord.update({
        where: { id: refundId },
        data: {
          status,
          transactionId: refund.refund_id || refund.transaction_id || '',
          successAt: succeeded
            ? refund.success_time
              ? new Date(refund.success_time)
              : new Date()
            : null,
          rawNotify: rawNotify ? (rawNotify as Prisma.InputJsonValue) : undefined,
          lastError: succeeded || status === 'PROCESSING' ? '' : '微信退款未成功',
        },
      }),
      this.prisma.paymentRecord.updateMany({
        where: { refunds: { some: { id: refundId } } },
        data: {
          status: succeeded
            ? PaymentRecordStatus.REFUNDED
            : status === 'PROCESSING'
              ? PaymentRecordStatus.REFUNDING
              : PaymentRecordStatus.FAILED,
        },
      }),
      this.prisma.order.updateMany({
        where: { refund: { id: refundId }, status: OrderStatus.CANCELLED },
        data: { paymentStatus: succeeded ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING },
      }),
    ])
  }

  private paymentMode() {
    const configured = this.config.get<string>('WECHAT_PAY_MODE')
    if (configured) return configured
    return this.config.get<string>('WECHAT_PAY_MOCK_ENABLED') === 'true' ? 'mock' : 'wechat'
  }

  private isMockPaymentEnabled() {
    if (this.paymentMode() !== 'mock' || this.config.get<string>('WECHAT_PAY_MOCK_ENABLED') !== 'true') return false
    if (this.config.get<string>('NODE_ENV') !== 'production') return true
    return (this.config.get<string>('APP_RELEASE_STAGE') || 'testing') === 'testing'
  }
}
