# 首次安装：SnowLuma 与 qq-bridge 登录

安装包只包含桌面控制中心，**不包含** SnowLuma、qq-bridge 及其账号凭据。
第一次在另一台机器部署时，需要分别处理两个服务的登录。

## qq-bridge：控制台令牌

- 文件：`C:\path\to\qq-bridge\state\console-token`
- 首次启动 qq-bridge 时如果没有这个文件，bridge 会自动生成一个新令牌。
- 使用桌面「服务网页 → qq-bridge 控制台」时，**不需要手动输入令牌**：
  主进程读取该文件，通过 `x-console-token` 请求头注入，令牌不出现在 URL 和页面里。
- 只有在**外部浏览器**直接打开 `http://127.0.0.1:3100/` 时，才需要令牌：
  ```powershell
  Get-Content C:\path\to\qq-bridge\state\console-token
  ```
- 重置令牌：停止 bridge，备份/删除 `state/console-token`，重新启动 bridge；桌面会自动读取新令牌。

> 不要把 `console-token` 打进分享包。每台机器应各自生成。

## SnowLuma：WebUI 密码（不是令牌）

SnowLuma 的登录凭据是 WebUI 密码，保存在：

```text
C:\path\to\SnowLuma\config\webui.json
```

里面是加盐哈希，不是明文；桌面不能帮你“读出”密码。

### 情况 A：从旧机器迁移

把旧的 `C:\path\to\SnowLuma\config\webui.json` 一起迁移过去，继续使用原来的 WebUI 密码即可。
不要为了“重新开始”随意删除它。

### 情况 B：全新安装，第一次启动

SnowLuma 首次启动会生成随机初始密码，并打印到 **stdout**：

```text
initial credentials: user=admin password=...
```

但桌面的隐藏启动看不到控制台输出，所以第一次初始化建议二选一：

#### 方式 1：用 bootstrap 环境变量设置已知密码（推荐）

在启动 SnowLuma 前设置至少 8 位密码，并做一次可见启动：

```powershell
$env:SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD = "请换成强密码"
Start-Process -FilePath "C:\path\to\SnowLuma\node.exe" -ArgumentList "index.mjs" -WorkingDirectory "C:\path\to\SnowLuma"
```

然后：

1. 打开 `http://127.0.0.1:5099`
2. 用 `admin` + 上面设置的密码登录
3. 在 SnowLuma 里改成自己的强密码
4. 关闭这次手动启动，之后由桌面控制中心启动

#### 方式 2：首次可见启动，记录随机初始密码

直接运行：

```powershell
C:\path\to\SnowLuma\node.exe index.mjs
```

在控制台找到 `initial credentials`，登录 5099 后立即改密；
再关闭这次手动实例，交给桌面启动。

### 情况 C：忘记密码

1. 停止 SnowLuma
2. 备份 `C:\path\to\SnowLuma\config\webui.json`
3. 删除或改名该文件
4. 按“全新安装”的方式重新初始化

## 分享安装包时不要带

- `qq-bridge/state/console-token`
- `qq-bridge/config.json` 里的 API Key、QQ token
- `SnowLuma/config/webui.json`
- QQ 登录会话/缓存

这些都应该由每个使用者本机生成或自行填写。
