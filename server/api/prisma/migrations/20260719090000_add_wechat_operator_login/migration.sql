ALTER TABLE "users" ADD COLUMN "unionid" TEXT;
ALTER TABLE "operators" ADD COLUMN "wechatOpenid" TEXT;
ALTER TABLE "operators" ADD COLUMN "wechatUnionid" TEXT;

CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");
CREATE UNIQUE INDEX "operators_wechatOpenid_key" ON "operators"("wechatOpenid");
CREATE UNIQUE INDEX "operators_wechatUnionid_key" ON "operators"("wechatUnionid");
