# 本地凭证边界

生产发布所需的云托管私钥、生产环境变量、小程序上传私钥、支付证书和业务材料不属于源代码仓库。

本项目推荐的安全目录为：

```text
macOS:  ~/Library/Application Support/city-flash-delivery/secrets/
Linux:  ~/.config/city-flash-delivery/secrets/
```

本地发布脚本会根据操作系统选择对应目录，也支持通过 `RELEASE_SECRETS_DIR` 覆盖：

```text
production.env
private.<小程序 AppID>.key
```

如果使用其他安全目录，可以在发布前设置：

```bash
export RELEASE_SECRETS_DIR=/secure/city-flash-delivery/secrets
npm run release:local
```

也可以只指定生产环境文件或小程序上传私钥：

```bash
RELEASE_ENV_FILE=/secure/city-flash-delivery/production.env npm run release:local
RELEASE_MINI_KEY_PATH=/secure/city-flash-delivery/miniprogram-upload.key npm run release:local
```

目录和私钥文件应仅允许当前用户读取（通常为 `700` 和 `600`）。不要把真实凭证复制到 `deploy/secrets/`，不要提交到 Git，也不要把内容粘贴到聊天或日志中。仓库中的 `deploy/secrets/.gitkeep` 只用于保留空目录，不代表真实凭证位置。

## 跨项目统一规则

其他项目也采用同一套边界，不要把密钥直接放进项目目录：

```text
macOS:  ~/Library/Application Support/<project-name>/secrets/
Linux:  ${XDG_CONFIG_HOME:-~/.config}/<project-name>/secrets/
```

每个项目使用独立目录，不在项目之间复用同一个 `production.env` 或私钥文件。文件名使用用途和服务名表达含义，例如 `wxcloud-cli.key`、`miniprogram-upload.<appid>.key`、`wechatpay-apiclient-key.pem`；不要用含义不明的 `key.pem` 覆盖多种用途。

凭证按运行位置分三层管理：

1. 本机开发和手动发布：放在上述项目专属目录，目录 `700`、文件 `600`；CLI 如果必须接收文件路径，就从这里读取。
2. CI/CD：使用 GitHub Actions Secrets/Environment、云平台 Secret 或其他密钥管理服务，不把本机凭证目录上传到 CI。
3. 生产运行时：使用微信云托管等平台的环境变量/密钥配置；本机 `production.env` 只作为发布输入，不作为镜像或运行时文件。

高价值、长期有效的凭证优先存放在 1Password、macOS 钥匙串或企业密钥管理服务中；只有在 CLI 明确要求文件路径时，才生成权限为 `600` 的临时文件，并在使用后清理。项目文档只记录变量名、用途、来源和轮换方式，不记录真实值。

每个项目都应保留一份类似本文档的凭证清单，并在提交前和 CI 中扫描 `.env`、PEM、KEY、P12 等敏感文件。发现凭证误提交时，应立即撤销/轮换，不能只依靠删除 Git 文件解决。
