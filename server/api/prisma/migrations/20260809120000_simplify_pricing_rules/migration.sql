-- Distance services use one start price, rounded-up kilometre overage, and no fee floor/cap.
UPDATE "pricing_rules"
SET
  "baseFeeFen" = "baseFeeFen" + "serviceSurchargeFen",
  "serviceSurchargeFen" = 0,
  "minimumFeeFen" = 0,
  "maxFeeFen" = 0,
  "weatherMultiplierBps" = 10000,
  "weatherSurchargeFen" = CASE
    WHEN "serviceId" IN ('urgent_delivery', 'pickup', 'buy_for_me') THEN 500
    ELSE 0
  END,
  "maxDistanceMeters" = CASE
    WHEN "serviceId" IN ('cargo_haul', 'urgent_delivery', 'pickup', 'buy_for_me', 'pedicab_delivery', 'moving_handling') THEN 100000
    ELSE "maxDistanceMeters"
  END,
  "deliveryStartFeeFen" = CASE
    WHEN "serviceId" = 'moving_handling' THEN 0
    ELSE "deliveryStartFeeFen"
  END,
  "includedDistanceMeters" = CASE
    WHEN "serviceId" = 'moving_handling' THEN 0
    ELSE "includedDistanceMeters"
  END,
  "perKmFen" = CASE
    WHEN "serviceId" = 'moving_handling' THEN 0
    ELSE "perKmFen"
  END
WHERE "serviceId" IN ('cargo_haul', 'urgent_delivery', 'pickup', 'buy_for_me', 'pedicab_delivery', 'moving_handling');
