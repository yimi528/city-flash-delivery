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
      serviceSurcharge: 2,
    })

    expect(estimate.productFee).toBe(50)
    expect(estimate.deliveryFee).toBe(12)
    expect(estimate.totalFee).toBe(62)
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
      basePrice: 28,
      extraPerKm: 2.8,
      serviceSurcharge: 20,
    })

    expect(estimate.isManualQuote).toBe(true)
    expect(estimate.deliveryFee).toBe(48)
    expect(estimate.totalFee).toBe(48)
  })

  it('changes fixed-line prices with the selected vehicle', () => {
    const van = service.estimate({
      serviceType: 'CARGO',
      serviceName: '寄货',
      vehicleType: 'VAN',
      pricingMode: 'fixed_line_parcel',
      linePrice: 58,
    })
    const ebike = service.estimate({
      serviceType: 'CARGO',
      serviceName: '寄货',
      vehicleType: 'EBIKE',
      pricingMode: 'fixed_line_parcel',
      linePrice: 58,
    })

    expect(van.deliveryFee).toBe(58)
    expect(ebike.deliveryFee).toBe(31.9)
  })

  it('caps unusually long same-city delivery fees', () => {
    const estimate = service.estimate({
      serviceType: 'DELIVERY',
      serviceName: '急送',
      vehicleType: 'EBIKE',
      pricingMode: 'distance_weather',
      distanceKm: 123.5,
      serviceSurcharge: 3,
    })

    expect(estimate.deliveryFee).toBe(68)
    expect(estimate.discountFee).toBeGreaterThan(0)
  })
})
