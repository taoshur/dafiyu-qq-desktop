# SnowLuma 授权申请信

> 用途：向 SnowLumaDevs 申请非商业开源桌面控制中心的公开发布与 SnowLuma 启停授权。
> 联系方式来自 SnowLuma `EULA.md`：`motricseven@foxmail.com`。
> 发送前请把方括号中的个人信息补全。

---

**收件人：** motricseven@foxmail.com  
**主题：** 非商业开源桌面控制中心关于 SnowLuma 启停与公开发布的授权申请

您好，SnowLumaDevs：

我是 taoshur，目前在维护一个非商业的开源 Windows 桌面控制中心：

- 项目：https://github.com/taoshur/dafiyu-qq-desktop
- 上游基础：https://github.com/Derpyu520/qq-bridge（MIT）
- 许可：MIT

这个项目**不是 SnowLuma 的修改版或分支**，也不包含、修改或再分发 SnowLuma 的源码、二进制或原生组件。用户需要自行从官方渠道获取并安装 SnowLuma；项目只通过本机回环端口与它交互。

## 当前功能

- 检测 SnowLuma 是否在运行、监听 3000/3001/5099
- 提供一个可选的“启动/停止”按钮，用于管理**用户自己安装的** SnowLuma
- 内嵌 SnowLuma WebUI，方便用户在本机登录
- 不修改 SnowLuma 的配置、原生组件或授权/激活机制
- 不把 SnowLuma 打包进安装包，也不做 Docker 镜像或 SaaS
- 完全免费、非商业，代码以 MIT 开源

## 需要申请的事项

我注意到 SnowLuma 的 `LICENSE` 与 `EULA` 对“公开的修改版/衍生版”和“通过自动化脚本部署”有额外限制。为避免误解，我想申请：

1. 允许本项目以非商业方式公开发布；
2. 允许本项目在用户本机上，以可选按钮的方式启动/停止用户自行安装的 SnowLuma；
3. 如获允许，请告知需要保留的版权声明、许可链接或其他署名要求。

如果我的理解有误，或者上述行为不需要额外授权，也请直接告诉我。

## 我方承诺

- 不复制、不打包、不再分发 SnowLuma 的源码或原生组件；
- 不修改 SnowLuma 的授权/激活机制；
- 不用于商业托管、代部署、收费服务；
- 项目继续保持非商业、免费、开源；
- 如果贵方认为启停功能需要限制，我可以立即把开源版本改为**仅检测**，只保留状态查看。

感谢您维护 SnowLuma，也感谢您抽时间确认。

祝好，  
taoshur  
GitHub：https://github.com/taoshur  
项目：https://github.com/taoshur/dafiyu-qq-desktop

---

## 简短英文版（如需附在邮件末尾）

Hello SnowLumaDevs,

I maintain a non-commercial, MIT-licensed Windows desktop control center:
https://github.com/taoshur/dafiyu-qq-desktop

It is not a fork or modified version of SnowLuma. It does not bundle,
modify, or redistribute SnowLuma or its native components. Users install
SnowLuma separately; the app only detects it and offers optional
start/stop controls on the user's own machine.

Could you please confirm whether this non-commercial open-source release,
and the optional start/stop of a user-installed SnowLuma, require written
permission under your LICENSE/EULA? If yes, I would like to request that
permission and any attribution requirements.

I will not redistribute SnowLuma, will not modify its licensing/activation,
and will keep the project free and non-commercial. If preferred, I can
change the open-source version to detection-only and remove the controls.

Thank you,  
taoshur  
GitHub: https://github.com/taoshur
