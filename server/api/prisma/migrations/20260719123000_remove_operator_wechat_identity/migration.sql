DROP INDEX IF EXISTS "operators_wechatOpenid_key";
DROP INDEX IF EXISTS "operators_wechatUnionid_key";

ALTER TABLE "operators"
  DROP COLUMN IF EXISTS "wechatOpenid",
  DROP COLUMN IF EXISTS "wechatUnionid";
