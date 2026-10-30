# Memory V4 回放评测（v0.8.4+）

## 目标

用同一套脱敏用例，比较不同版本的：

- 准确召回
- 模糊语义
- 时间范围
- 跨人物归属
- 多轮共同经历
- 不存在事件
- Token 消耗

## 隔离方式

评测脚本：

```text
scripts/memory-eval.js
```

每次用例：

- 新建临时目录
- 新建独立 SQLite
- 只写入评测种子
- 不读取、不写入生产 `memory.db`
- 不修改桌面配置

运行：

```powershell
npm run eval:memory
```

输出：

```text
artifacts/memory-eval-report.json
artifacts/memory-eval-report.md
```

## 基线结果

数据集：

```text
anonymized-memory-baseline-v1
```

当前 6 个用例：

| 用例 | 类型 | Recall | 误召回 | Token |
|---|---|---:|---:|---:|
| exact-preference | 准确召回 | 100% | 0 | 11 |
| fuzzy-emotion | 模糊语义 | 100% | 0 | 20 |
| time-yesterday | 时间范围 | 100% | 0 | 10 |
| cross-person | 跨人物归属 | 100% | 0 | 11 |
| multi-turn | 多轮共同经历 | 100% | 0 | 17 |
| absent | 不存在事件 | 100% | 0 | 0 |

汇总：

```text
Recall: 100%
Precision: 100%
误召回: 0
幻觉率: 0%
平均 Token: 11.5
```

## 重要限制

这 6 条是**人工脱敏的基线用例**，不是把生产聊天原文直接导出。

原因：

- 生产库含私人关系、情绪和身份信息
- 直接导出会违反数据最小化
- 需要用户明确同意后才能做真实样本回放

因此当前报告应称为：

> **脱敏基线评测**，不是完整生产聊天回放。

下一阶段可以在用户批准后，按以下流程扩充：

1. 只读生产库
2. 脱敏姓名、QQ、群号、敏感实体
3. 人工确认查询/期望结果
4. 写入独立 fixture
5. 重新跑同一脚本

## 当前结论

- 准确、时间、跨人物和不存在的场景在基线上通过
- 模糊语义通过概念扩展（不是 embedding）
- 跨人物错误注入已通过 subject scope 修复
- 还没有足够样本证明生产分布上的召回率
- 暂不引入 Embedding，等真实脱敏样本扩大后再决定
