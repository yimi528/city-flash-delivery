ALTER TABLE "pricing_rules" ADD COLUMN "parcelPricing" JSONB;

UPDATE "service_routes"
SET "unitPriceFen" = 1
WHERE "serviceId" = 'send_parcel';

UPDATE "pricing_rules" AS rule
SET "parcelPricing" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'routeId', route."id",
      'itemType', option."itemType",
      'weightBand', option."weightBand",
      'priceFen', 1,
      'enabled', true
    )
    ORDER BY route."sortOrder", route."id", option."itemType", option."weightBand"
  )
  FROM "service_routes" AS route
  CROSS JOIN (
    VALUES
      ('NORMAL', 'UP_TO_10'),
      ('NORMAL', 'UP_TO_30'),
      ('PET', 'ANY')
  ) AS option("itemType", "weightBand")
  WHERE route."serviceId" = 'send_parcel'
    AND route."enabled" = true
)
WHERE rule."serviceId" = 'send_parcel';
