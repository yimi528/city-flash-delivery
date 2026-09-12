# Shared Contracts

当前质量门禁通过 `npm run test:shared` 校验本包契约；发布版本由根目录 Git tag 管理，当前线上代码基线为 `3c392ec`。

这里放用户端、商家端和后端共用的业务约定，例如订单状态和角色枚举。状态值使用 API 传输层的英文枚举，展示文案由各端负责。

本目录是一个独立的私有包 `@city-flash/shared`，入口由 `package.json` 的 `exports` 声明。当前各应用仍保留本地适配层，以兼容微信开发者工具的直接运行、API 的 TypeScript 构建和各自独立的 Docker 发布上下文；新增状态或角色时，必须同步更新这里和各端的映射，并在质量检查中验证。

根目录目前不启用 npm workspaces：API 和商家端需要保留各自的 `package-lock.json`，因为 Docker/微信云托管会以子项目目录作为独立构建上下文。若将来引入 workspace，应同步改造 Docker、CI 和云托管发布上下文，不应只在根 `package.json` 增加一个字段。
