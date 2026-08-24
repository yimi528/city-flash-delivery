/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common'
import { OrderStatus, PaymentRecordStatus, PaymentStatus, QuoteStatus } from '@prisma/client'
import { generateKeyPairSync, sign } from 'node:crypto'
import { PaymentsService } from './payments.service'

const now = new Date('2026-07-12T00:00:00.000Z')

function order(overrides = {}) {
  return {
    id: 'order-1',
    orderNo: 'N202607120001',
    userId: 'user-1',
    serviceName: '急送',
    status: OrderStatus.PENDING,
    totalFee: 13,
    paymentStatus: PaymentStatus.UNPAID,
    isManualQuote: false,
    quoteStatus: QuoteStatus.NONE,
    user: { id: 'user-1', openid: 'openid-1' },
    payment: null,
    ...overrides,
  }
}

describe('PaymentsService development flow', () => {
  const paymentApi = {
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  }
  const orderApi = {
    findFirst: jest.fn(),
    update: jest.fn(),
  }
  const prisma = {
    paymentRecord: paymentApi,
    order: orderApi,
    refundRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    paymentReconciliation: { upsert: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  }
  const config = {
    get: jest.fn(
      (key: string) => ({ NODE_ENV: 'development', WECHAT_PAY_MOCK_ENABLED: 'true' })[key],
    ),
  }
  const service = new PaymentsService(prisma as never, config as never)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a mock prepay record without marking the order paid', async () => {
    orderApi.findFirst.mockResolvedValue(order())
    paymentApi.upsert.mockResolvedValue({ id: 'payment-1', status: PaymentRecordStatus.PENDING })

    const result = await service.createPrepay('order-1', 'user-1')

    expect(result).toEqual(expect.objectContaining({ mode: 'mock', amountFen: 1300 }))
    expect(paymentApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amountFen: 1300, status: PaymentRecordStatus.PENDING }),
      }),
    )
  })

  it('confirms a mock payment and marks the order paid', async () => {
    orderApi.findFirst.mockResolvedValue(
      order({
        payment: {
          id: 'payment-1',
          status: PaymentRecordStatus.PENDING,
          paidAt: null,
          amountFen: 1300,
        },
      }),
    )
    paymentApi.update.mockResolvedValue({
      id: 'payment-1',
      status: PaymentRecordStatus.SUCCEEDED,
      paidAt: now,
    })
    orderApi.update.mockResolvedValue({ id: 'order-1', paymentStatus: PaymentStatus.PAID })

    const result = await service.confirmMockPayment('order-1', 'user-1')

    expect(result.paymentStatus).toBe(PaymentStatus.PAID)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('allows mock payments in a production runtime only during the testing release stage', async () => {
    const testingConfig = {
      get: jest.fn((key: string) => ({
        NODE_ENV: 'production',
        APP_RELEASE_STAGE: 'testing',
        WECHAT_PAY_MODE: 'mock',
        WECHAT_PAY_MOCK_ENABLED: 'true',
      })[key]),
    }
    orderApi.findFirst.mockResolvedValue(order())
    paymentApi.upsert.mockResolvedValue({ id: 'payment-1', status: PaymentRecordStatus.PENDING })
    const testingService = new PaymentsService(prisma as never, testingConfig as never)

    await expect(testingService.createPrepay('order-1', 'user-1')).resolves.toEqual(
      expect.objectContaining({ mode: 'mock' }),
    )
  })

  it('blocks online payment when payment mode is disabled', async () => {
    const disabledConfig = {
      get: jest.fn((key: string) => ({
        NODE_ENV: 'production',
        APP_RELEASE_STAGE: 'production',
        WECHAT_PAY_MODE: 'disabled',
        WECHAT_PAY_MOCK_ENABLED: 'false',
      })[key]),
    }
    orderApi.findFirst.mockResolvedValue(order())
    const disabledService = new PaymentsService(prisma as never, disabledConfig as never)

    await expect(disabledService.createPrepay('order-1', 'user-1')).rejects.toThrow(
      '暂未开通在线支付',
    )
  })

  it('creates a signed JSAPI prepay request in real WeChat Pay mode', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const realConfig = {
      get: jest.fn((key: string) => ({
        NODE_ENV: 'production',
        WECHAT_PAY_MODE: 'wechat',
        WECHAT_PAY_MOCK_ENABLED: 'false',
        WECHAT_MINI_APP_ID: 'wx123',
        WECHAT_PAY_MCH_ID: '1900000001',
        WECHAT_PAY_CERT_SERIAL: 'MERCHANT-SERIAL',
        WECHAT_PAY_PRIVATE_KEY: privateKeyDer,
        WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_3000000001',
        WECHAT_PAY_PUBLIC_KEY: publicKeyPem,
        WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_NOTIFY_URL: 'https://api.city-flash.test/api/payments/wechat/notify',
        WECHAT_PAY_REFUND_NOTIFY_URL: 'https://api.city-flash.test/api/payments/wechat/refund-notify',
      })[key]),
    }
    const realOrder = order()
    orderApi.findFirst.mockResolvedValue(realOrder)
    paymentApi.upsert.mockResolvedValue({
      id: 'payment-1',
      status: PaymentRecordStatus.PENDING,
    })
    const realService = new PaymentsService(prisma as never, realConfig as never)
    const responseBody = JSON.stringify({ prepay_id: 'wx-prepay-1' })
    const responseTimestamp = String(Math.floor(Date.now() / 1000))
    const responseNonce = 'response-nonce'
    const responseSignature = sign(
      'RSA-SHA256',
      Buffer.from(`${responseTimestamp}\n${responseNonce}\n${responseBody}\n`),
      privateKey,
    ).toString('base64')
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(responseBody, {
        status: 200,
        headers: {
          'wechatpay-timestamp': responseTimestamp,
          'wechatpay-nonce': responseNonce,
          'wechatpay-signature': responseSignature,
          'wechatpay-serial': 'PUB_KEY_ID_3000000001',
        },
      }),
    )

    try {
      const result = await realService.createPrepay('order-1', 'user-1')

      expect(result).toEqual(expect.objectContaining({ mode: 'wechat', amountFen: 1300 }))
      expect(result.params).toEqual(expect.objectContaining({
        package: 'prepay_id=wx-prepay-1',
        signType: 'RSA',
      }))
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('mchid="1900000001"'),
            'Wechatpay-Serial': 'PUB_KEY_ID_3000000001',
          }),
        }),
      )
      const [, request] = fetchMock.mock.calls[0]
      expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
        appid: 'wx123',
        mchid: '1900000001',
        amount: { total: 1300, currency: 'CNY' },
        payer: { openid: 'openid-1' },
      }))
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('requires quote acceptance before manual service payment', async () => {
    orderApi.findFirst.mockResolvedValue(
      order({ isManualQuote: true, quoteStatus: QuoteStatus.QUOTED }),
    )

    await expect(service.createPrepay('order-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })

  it('prevents payment after an order is cancelled', async () => {
    orderApi.findFirst.mockResolvedValue(order({ status: OrderStatus.CANCELLED }))

    await expect(service.createPrepay('order-1', 'user-1')).rejects.toThrow('已取消订单不能支付')
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })

  it('starts one real refund and leaves processing refunds idempotent', async () => {
    const realConfig = {
      get: jest.fn(
        (key: string) => ({ NODE_ENV: 'production', WECHAT_PAY_MODE: 'wechat', WECHAT_PAY_MOCK_ENABLED: 'false' })[key],
      ),
    }
    const realOrder = order({
      paymentStatus: PaymentStatus.PAID,
      payment: {
        id: 'payment-1',
        status: PaymentRecordStatus.SUCCEEDED,
        amountFen: 1300,
        transactionId: 'wx-transaction-1',
        refunds: [],
      },
    })
    orderApi.findFirst.mockResolvedValue(realOrder)
    prisma.refundRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'refund-1',
      status: 'PROCESSING',
      outRefundNo: 'RF-N202607120001',
      reason: '用户取消订单',
    })
    prisma.refundRecord.upsert.mockResolvedValue({
      id: 'refund-1',
      outRefundNo: 'RF-N202607120001',
      reason: '用户取消订单',
    })
    const realService = new PaymentsService(prisma as never, realConfig as never)
    const requestRefund = jest.spyOn(realService as any, 'requestWechatRefund')
    requestRefund.mockResolvedValue({
      out_refund_no: 'RF-N202607120001',
      refund_status: 'PROCESSING',
    })
    const persistRefund = jest.spyOn(realService as any, 'persistRefundResult')
    persistRefund.mockResolvedValue(undefined)

    await expect(realService.refundForCancellation('order-1', 'user-1')).resolves.toEqual({
      paymentStatus: PaymentStatus.REFUNDING,
    })
    await expect(realService.refundForCancellation('order-1', 'user-1')).resolves.toEqual({
      paymentStatus: PaymentStatus.REFUNDING,
    })
    expect(requestRefund).toHaveBeenCalledTimes(1)

    requestRefund.mockRestore()
    persistRefund.mockRestore()
  })

  it('acknowledges duplicate successful refund callbacks without changing state again', async () => {
    const refundRecord = { id: 'refund-1', status: 'SUCCEEDED', amountFen: 1300 }
    prisma.refundRecord.findUnique.mockResolvedValue(refundRecord)
    const verifyNotification = jest.spyOn(service as any, 'verifyWechatNotification')
    verifyNotification.mockImplementation(() => undefined)
    const decryptResource = jest.spyOn(service as any, 'decryptWechatResource')
    decryptResource.mockReturnValue({
      out_refund_no: 'RF-N202607120001',
      refund_status: 'SUCCESS',
      amount: { refund: 1300 },
    })

    const result = await service.handleWechatRefundNotification('{}', {
      timestamp: '1700000000',
      nonce: 'nonce',
      signature: 'signature',
      serial: 'serial',
    })

    expect(result).toEqual({ code: 'SUCCESS', message: '成功' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    verifyNotification.mockRestore()
    decryptResource.mockRestore()
  })

  it('verifies WeChat Pay responses with the configured public key ID', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const publicKeyConfig = {
      get: jest.fn((key: string) => ({
        WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_3000000001',
        WECHAT_PAY_PUBLIC_KEY: publicKeyPem,
      })[key]),
    }
    const publicKeyService = new PaymentsService(prisma as never, publicKeyConfig as never)
    const body = '{"code":"SUCCESS"}'
    const timestamp = '1780000000'
    const nonce = 'nonce'
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
      privateKey,
    ).toString('base64')

    expect(() => (publicKeyService as any).verifyWechatResponse(body, {
      timestamp,
      nonce,
      signature,
      serial: 'PUB_KEY_ID_3000000001',
    })).not.toThrow()
  })

  it('reconciles bill rows into explicit mismatch statuses', async () => {
    const downloadBill = jest.spyOn(service as any, 'downloadTradeBill')
    downloadBill.mockResolvedValue({
      billDate: '2026-07-13',
      records: [
        {
          商户订单号: 'CF-MATCH',
          微信订单号: 'wx-1',
          交易状态: '支付成功',
          订单金额: '13.00',
          退款金额: '0.00',
        },
        {
          商户订单号: 'CF-MISSING',
          微信订单号: 'wx-2',
          交易状态: '支付成功',
          订单金额: '8.00',
          退款金额: '0.00',
        },
      ],
    })
    paymentApi.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        amountFen: 1300,
        status: PaymentRecordStatus.SUCCEEDED,
      })
      .mockResolvedValueOnce(null)
    prisma.paymentReconciliation.upsert.mockResolvedValue({})

    const result = await service.reconcileTradeBill('2026-07-13')

    expect(result).toEqual({
      billDate: '2026-07-13',
      total: 2,
      counts: { MATCHED: 1, MISSING_LOCAL: 1, AMOUNT_MISMATCH: 0, REFUND_MISMATCH: 0 },
    })
    expect(prisma.paymentReconciliation.upsert).toHaveBeenCalledTimes(2)
    downloadBill.mockRestore()
  })
})
