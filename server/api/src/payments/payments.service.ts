import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, PaymentRecordStatus, PaymentStatus, Prisma, QuoteStatus } from '@prisma/client'
import { createDecipheriv, randomBytes, sign, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
    const mockEnabled = this.isDevelopmentMockEnabled()
    if (!mockEnabled && !order.user.openid) throw new ConflictException('当前用户缺少微信 openid，请重新登录')

    const outTradeNo = order.payment?.outTradeNo || this.createOutTradeNo()
    const payerOpenid = order.user.openid || 'mock-openid-demo-user'
    if (mockEnabled) {
      const payment = await this.prisma.paymentRecord.upsert({
        where: { orderId: order.id },
        update: { amountFen, payerOpenid, status: PaymentRecordStatus.PENDING },
        create: { orderId: order.id, outTradeNo, amountFen, payerOpenid, status: PaymentRecordStatus.PENDING },
      })
      return { mode: 'mock', orderId: order.id, paymentId: payment.id, amountFen }
    }

    const prepayId = order.payment?.prepayId || await this.requestWechatPrepay({
      outTradeNo,
      description: `${order.serviceName || '同城配送'}-${order.orderNo}`.slice(0, 127),
      amountFen,
      payerOpenid,
    })
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
          }
        : null,
    }
  }

  async confirmMockPayment(orderId: string, userId: string) {
    if (!this.isDevelopmentMockEnabled()) throw new ForbiddenException('模拟支付只允许在开发环境使用')
    const order = await this.findOrder(orderId, userId)
    if (order.status === OrderStatus.CANCELLED) throw new ConflictException('已取消订单不能支付')
    if (!order.payment) throw new ConflictException('请先创建预支付订单')
    await this.prisma.$transaction([
      this.prisma.paymentRecord.update({
        where: { id: order.payment.id },
        data: { status: PaymentRecordStatus.SUCCEEDED, paidAt: new Date(), transactionId: `MOCK-${Date.now()}` },
      }),
      this.prisma.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PAID } }),
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
    const payment = await this.prisma.paymentRecord.findUnique({ where: { outTradeNo: transaction.out_trade_no } })
    if (!payment) throw new NotFoundException('支付订单不存在')
    if (Number(transaction.amount?.total) !== payment.amountFen) throw new ConflictException('支付金额校验失败')
    if (payment.status === PaymentRecordStatus.SUCCEEDED) return { code: 'SUCCESS', message: '成功' }

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
        this.prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.PAID } }),
        this.prisma.outboxEvent.create({
          data: { aggregateId: payment.orderId, eventType: 'ORDER_AVAILABLE', payload: { orderId: payment.orderId } },
        }),
      ])
    }
    return { code: 'SUCCESS', message: '成功' }
  }

  private async findOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNo: orderId }] },
      include: { user: true, payment: true },
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

    let response: Response
    try {
      response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `WECHATPAY2-SHA256-RSA2048 ${authorization}`,
        },
        body,
      })
    } catch {
      throw new BadGatewayException('微信支付下单服务暂时不可用')
    }
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
    if (!resource?.ciphertext || !resource.nonce) throw new UnauthorizedException('微信支付回调数据不完整')
    const apiV3Key = this.required('WECHAT_PAY_API_V3_KEY')
    if (Buffer.byteLength(apiV3Key) !== 32) throw new ServiceUnavailableException('WECHAT_PAY_API_V3_KEY 必须为 32 字节')
    const encrypted = Buffer.from(resource.ciphertext, 'base64')
    const authTag = encrypted.subarray(encrypted.length - 16)
    const ciphertext = encrypted.subarray(0, encrypted.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resource.nonce))
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(resource.associated_data || ''))
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    return JSON.parse(plaintext) as WechatTransaction
  }

  private rsaSign(message: string) {
    return sign('RSA-SHA256', Buffer.from(message), this.loadPem('WECHAT_PAY_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY'))
      .toString('base64')
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

  private isDevelopmentMockEnabled() {
    return this.config.get<string>('NODE_ENV') !== 'production' && this.config.get<string>('WECHAT_PAY_MOCK_ENABLED') === 'true'
  }
}
