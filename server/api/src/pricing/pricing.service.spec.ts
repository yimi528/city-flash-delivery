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

  it('rounds partial overage kilometres up and does not cap the delivery fee', () => {
    const estimate = service.estimate({
      serviceType: 'DELIVERY',
      serviceName: '急送',
      vehicleType: 'EBIKE',
      pricingMode: 'distance_weather',
      distanceKm: 4.1,
      serviceSurcharge: 3,
    })

    expect(estimate.distanceFee).toBe(1.6)
    expect(estimate.deliveryFee).toBe(14.6)
    expect(estimate.discountFee).toBe(0)
  })

  it('adds bad-weather pricing only for two-wheel services', () => {
    const ebike = service.estimate({
      serviceType: 'DELIVERY',
      vehicleType: 'EBIKE',
      pricingMode: 'distance_weather',
      distanceKm: 2.5,
      badWeather: true,
      badWeatherSurcharge: 5,
    })
    const etrike = service.estimate({
      serviceType: 'CARGO',
      vehicleType: 'ETRIKE',
      pricingMode: 'distance_weather',
      distanceKm: 2.5,
      badWeather: true,
      badWeatherSurcharge: 5,
    })

    expect(ebike.weatherFee).toBe(5)
    expect(etrike.weatherFee).toBe(0)
  })
})
