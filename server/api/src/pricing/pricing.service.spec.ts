import { PricingService } from './pricing.service'

describe('PricingService', () => {
  const service = new PricingService()

  it('includes product and delivery fees in buy-for-me totals', () => {
    const estimate = service.estimate({
      serviceType: 'BUY_FOR_ME',
      serviceName: '帮买',
      vehicleType: 'EBIKE',
      distanceKm: 2.5,
      productFee: 50,
    })

    expect(estimate.productFee).toBe(50)
    expect(estimate.deliveryFee).toBe(10)
    expect(estimate.totalFee).toBe(60)
  })

  it('does not add product fees to non-buy services', () => {
    const estimate = service.estimate({
      serviceType: 'DELIVERY',
      vehicleType: 'EBIKE',
      distanceKm: 2.5,
      productFee: 50,
    })

    expect(estimate.productFee).toBe(0)
    expect(estimate.totalFee).toBe(10)
  })

  it('returns a rule-based estimate before a manual quote order is created', () => {
    const estimate = service.estimate({
      serviceType: 'CARGO',
      serviceName: '搬运装卸',
      vehicleType: 'ETRIKE',
      pricingMode: 'manual_quote',
      distanceKm: 2.5,
      basePrice: 58,
      extraPerKm: 5,
    })

    expect(estimate.isManualQuote).toBe(true)
    expect(estimate.deliveryFee).toBe(58)
    expect(estimate.totalFee).toBe(58)
  })
})
