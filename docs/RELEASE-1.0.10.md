# Dafiyu Control Center 1.0.10

## 聊天设置

新增「聊天设置」卡片：

- 快速通道开关
- Base URL
- API Key（留空保留已保存密钥）
- 模型下拉框
- 「检测模型」按钮

检测会请求 OpenAI 兼容的：

```text
GET {baseUrl}/models
```

并把返回的模型填进下拉框。保存后写入 qqbridge：

```text
socialV2.fastPath.enabled
socialV2.fastPath.baseUrl
socialV2.fastPath.apiKey
socialV2.fastPath.model
```

修改后需要重启 qqbridge 生效。

## 构建

```text
size: 123,469,642
sha256: A3923594FB4008FD9A01127CB564B1825B8E052B1BC1796AA7818A3E26B627F8
```

本次仅本地构建和安装，未推送、未发布。
