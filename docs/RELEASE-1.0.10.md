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
size: 123,469,356
sha256: E25504E71E809C8A55D7A75B500E3DF5297EB967DABC3384CFC69AD7AA95B854
```

本次仅本地构建和安装，未推送、未发布。
