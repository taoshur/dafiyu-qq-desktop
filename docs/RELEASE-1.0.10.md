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

## 表情链路修复

- 修复 `sendStickerV2` / `sendVoiceV2` 使用未声明 `sendChain` 的问题
- 自动补图不再持续报 `sendChain is not defined`
- 表情库同步、查找、CDN 下载链路已验证

## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.4.zip
size: 1,606,932
sha256: F3A908858226A3746ADDFB892FCD10290654A71074AB9C261A570DEEBA7C95D8
```

## 构建

```text
管理器
size: 123,469,642
sha256: A3923594FB4008FD9A01127CB564B1825B8E052B1BC1796AA7818A3E26B627F8
```
