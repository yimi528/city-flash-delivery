import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { CurrentAuth } from '../auth/current-auth.decorator'
import { CustomerAuthGuard, OperatorAuthGuard } from '../auth/auth.guard'
import { AuthPrincipal } from '../auth/auth-token.service'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders/:orderId/prepay')
  @UseGuards(CustomerAuthGuard)
  createPrepay(@Param('orderId') orderId: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.paymentsService.createPrepay(orderId, auth.subjectId)
  }

  @Get('orders/:orderId')
  @UseGuards(CustomerAuthGuard)
  getPayment(@Param('orderId') orderId: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.paymentsService.getPayment(orderId, auth.subjectId)
  }

  @Post('orders/:orderId/mock-confirm')
  @UseGuards(CustomerAuthGuard)
  confirmMockPayment(@Param('orderId') orderId: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.paymentsService.confirmMockPayment(orderId, auth.subjectId)
  }

  @Post('orders/:orderId/refund')
  @UseGuards(CustomerAuthGuard)
  refund(@Param('orderId') orderId: string, @CurrentAuth() auth: AuthPrincipal) {
    return this.paymentsService.refundForCancellation(orderId, auth.subjectId)
  }

  @Post('wechat/notify')
  @HttpCode(200)
  handleWechatNotify(
    @Req() request: { rawBody?: Buffer },
    @Headers('wechatpay-timestamp') timestamp: string,
    @Headers('wechatpay-nonce') nonce: string,
    @Headers('wechatpay-signature') signature: string,
    @Headers('wechatpay-serial') serial: string,
  ) {
    return this.paymentsService.handleWechatNotification(request.rawBody?.toString('utf8') || '', {
      timestamp,
      nonce,
      signature,
      serial,
    })
  }

  @Post('wechat/refund-notify')
  @HttpCode(200)
  handleWechatRefundNotify(
    @Req() request: { rawBody?: Buffer },
    @Headers('wechatpay-timestamp') timestamp: string,
    @Headers('wechatpay-nonce') nonce: string,
    @Headers('wechatpay-signature') signature: string,
    @Headers('wechatpay-serial') serial: string,
  ) {
    return this.paymentsService.handleWechatRefundNotification(
      request.rawBody?.toString('utf8') || '',
      {
        timestamp,
        nonce,
        signature,
        serial,
      },
    )
  }

  @Get('admin/trade-bill')
  @UseGuards(OperatorAuthGuard)
  downloadTradeBill(@Query('billDate') billDate?: string) {
    return this.paymentsService.downloadTradeBill(billDate)
  }

  @Post('admin/reconcile')
  @UseGuards(OperatorAuthGuard)
  reconcileTradeBill(@Query('billDate') billDate?: string) {
    return this.paymentsService.reconcileTradeBill(billDate)
  }

  @Get('admin/reconciliation')
  @UseGuards(OperatorAuthGuard)
  listReconciliation(@Query('status') status?: string) {
    return this.paymentsService.listReconciliation(status)
  }
}
