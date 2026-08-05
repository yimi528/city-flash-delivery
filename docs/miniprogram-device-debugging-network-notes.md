# 小程序真机调试与后端网络使用注意事项

## 一、先确认使用哪种后端

项目有两种使用方式：

### 1. Windows 局域网后端

小程序请求 Windows 电脑上的 API，例如：

```text
http://192.168.2.105:3000/api
```

使用这种方式时，运行微信开发者工具的电脑或真机必须能够访问 Windows 的 `192.168.2.105:3000`。

不要求一定连接同一个 Wi-Fi，但两台设备之间必须网络可达。最简单的方式是让 Windows、Mac 和手机连接同一个普通 Wi-Fi，不要使用访客网络。

### 2. 公网 HTTPS 后端

如果 API 已部署到公网 HTTPS 域名，朋友不需要和 Windows 连接同一个网络，只需要能够正常上网，并且在微信公众平台配置 request 合法域名。

生产或体验环境应优先使用公网 HTTPS 后端，不要把 Windows 开发电脑作为长期生产服务器。

## 二、Windows 后端检查

在 Windows PowerShell 中执行：

```powershell
ipconfig
Get-NetTCPConnection -LocalPort 3000 -State Listen
curl.exe http://127.0.0.1:3000/api/health
curl.exe http://<Windows局域网IPv4>:3000/api/health
```

正常情况下应满足：

- 无线网卡有局域网 IPv4 地址；
- API 监听在 `0.0.0.0:3000`，而不是只监听 `127.0.0.1:3000`；
- 健康检查返回 `status: ok`；
- 健康检查中的 `database` 为 `true`。

如果 Windows 本机访问正常，但其他设备访问失败，使用管理员 PowerShell 放行开发端口：

```powershell
Set-NetConnectionProfile -InterfaceAlias "WLAN" -NetworkCategory Private
New-NetFirewallRule -DisplayName "City Flash API 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

只建议在可信的家庭或办公局域网中开放这个开发端口，不要直接把 3000 端口暴露到公网。

## 三、Mac 或朋友电脑检查

在运行微信开发者工具的电脑上执行：

```bash
nc -vz <Windows局域网IPv4> 3000
curl http://<Windows局域网IPv4>:3000/api/health
```

`nc` 应显示 `succeeded`，`curl` 应返回健康检查 JSON。

如果 `nc` 超时，问题在网络、防火墙或路由器隔离，不是小程序代码问题。检查：

- Mac、Windows 是否连接同一个普通 Wi-Fi；
- 是否误连接了访客网络；
- 路由器是否开启“无线客户端隔离”；
- Windows 的 IPv4 地址是否发生变化；
- Windows 防火墙是否允许 TCP 3000。

## 四、代理和 VPN 注意事项

微信开发者工具运行在哪台电脑，就要检查哪台电脑的代理/VPN。

例如开发者工具运行在 Mac 上时，Mac 上的 iKuuu、Clash 或系统 HTTP/HTTPS/SOCKS 代理可能导致：

```text
ERR_PROXY_CONNECTION_FAILED
ERR_CONNECTION_TIMED_OUT
request:fail timeout
```

排查时建议：

1. 暂时完全退出 Mac 上的代理/VPN 软件；
2. 在 macOS“系统设置 → 网络 → Wi-Fi → 代理”中关闭 HTTP、HTTPS 和 SOCKS 代理；
3. 完全退出并重新打开微信开发者工具；
4. 重新编译小程序。

可以用下面的命令检查 macOS 是否仍启用了代理：

```bash
scutil --proxy
```

`HTTPEnable`、`HTTPSEnable` 和 `SOCKSEnable` 应为 `0`。

## 五、开发者工具中的接口地址

开发环境接口地址配置在：

```text
apps/customer-mp/config/runtime.js
```

如果 Windows 的局域网 IPv4 发生变化，需要同步修改开发地址，或者在开发者工具控制台设置：

```js
wx.setStorageSync('developerApiBaseUrl', 'http://<Windows局域网IPv4>:3000/api')
```

修改后重新编译，并确认小程序实际请求的地址中包含正确的 Windows IPv4。

## 六、根据错误快速判断

| 错误 | 常见原因 |
| --- | --- |
| `ERR_PROXY_CONNECTION_FAILED` | Mac 或朋友电脑的代理/VPN 拦截请求 |
| `ERR_CONNECTION_TIMED_OUT` | 防火墙、网络隔离、IP 不可达或后端未运行 |
| `request:fail timeout` | 小程序请求没有在超时时间内收到响应，需要查看 Network 详情 |
| `无法获取微信登录凭证` | `wx.login` 失败，通常与微信开发者工具网络、代理或 AppID 配置有关 |
| `/api/health` 正常但 `/api/v1/app-config` 失败 | 后端应用配置接口或数据库依赖异常，应查看 Windows 后端日志 |

## 七、朋友使用真机调试的结论

- 使用 Windows 局域网后端：朋友的电脑或手机必须能访问 Windows 的局域网 IP 和 3000 端口；
- 使用公网 HTTPS 后端：不需要和 Windows 在同一个网络；
- 真机调试时，手机本身也必须能够访问 API，不能只检查开发者电脑；
- 朋友的代理/VPN、路由器访客网络和 Windows 防火墙都可能单独造成请求失败。
