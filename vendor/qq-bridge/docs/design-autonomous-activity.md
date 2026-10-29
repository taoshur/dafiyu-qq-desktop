# 自主活动选择机制 · 设计方案（未实现，待审核）

> 状态：**设计稿**。生产代码未改动。
> 结论先说：**当前架构不支持真正的"自主选择活动"**。兴趣只通过 `growthContext()` 以文字形式进入唤醒提示词，
> 没有任何"按兴趣挑活动 / 排唤醒 / 调工具"的决策代码。现在能做的只是"让她更容易想起某个话题"，
> 不能称为自主行为。

## 1. 现状与能力边界

| 能力 | 现状 | 证据 |
| --- | --- | --- |
| 兴趣写入 | 有 | `interest_signals` / `traits(category=interest)` / `trait_evidence` |
| 兴趣注入提示词 | 有 | `growthContext()` → 桥接 `growthText`（bridge.js 注入点） |
| 按兴趣选择活动 | **没有** | 无任何调度/选择代码读 interest traits |
| 唤醒调度 | 有时间/概率/关键词触发 | 与兴趣无关 |
| 工具权限 | 白名单前缀（`qq-tool-restrict`） | 与兴趣无关 |
| 频控 | 主动消息概率、`playPauseUntil`、每日主动次数 | 与兴趣无关 |

因此：**"兴趣形成后参与 +25/+16" 是工具调用计数，不是自主选择的证据。**

## 2. 设计目标

1. 兴趣能**影响**选择，但**不能强制**重复：允许"今天不想玩"。
2. 严格区分三种来源：`user_request`（用户要求）、`system_plan`（系统计划/定时任务）、`self_choice`（角色自主）。
3. 只有同时满足：有空闲时间、有对应工具权限、有合适机会（话题/触发）时才考虑主动活动。
4. 不新增权限、不绕过频率/资源限制、不改变 `observeOnly`。
5. 绝不为了刷成长数据而反复调用工具。
6. 分开计数：**选择**、**执行成功**、**兴趣确认**是三件事。
7. 可关闭、可观察、可回滚、可降级。

## 3. 数据结构（新增表，全部可回滚）

```sql
CREATE TABLE activity_intents (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  conv_key TEXT NOT NULL,
  source TEXT NOT NULL,          -- user_request | system_plan | self_choice
  activity TEXT NOT NULL,        -- play_game | watch_bili | qzone | sing | chat
  reason TEXT,                   -- 为什么选它（兴趣/好奇/无聊/被要求）
  interest_key TEXT,             -- 关联兴趣（可空）
  weight REAL,                   -- 选择时的权重（便于事后复盘）
  gate TEXT,                     -- 通过/拦在哪一步（json）
  outcome TEXT,                  -- skipped | executed | failed
  tool_calls INTEGER DEFAULT 0,
  created_by TEXT                -- autonomy-v1 | bridge | manual
);

CREATE TABLE activity_runs (
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL,
  started_at INTEGER, ended_at INTEGER,
  tool_calls INTEGER, tool_fails INTEGER,
  result TEXT,                   -- ok | partial | failed | aborted
  note TEXT
);
```

兴趣确认仍走现有 `interest_signals` / `trait_evidence`，**不新增第四套计数**。

## 4. 选择流程（守门 → 打分 → 采样 → 预算）

```
每次主动机会（现有 wake 时机）
 1) 可用性门禁 gate:
    - 开关 autonomy.enabled（默认 false）
    - 最近 5 分钟无用户消息；不在"专注潜水"里
    - 今日主动次数 < 预算（沿用现有 cap）
    - 活动所需工具在当前前缀白名单内（play_game→android、watch_bili→bilibili…）
    - 活动冷却已过（每活动独立 cooldown，失败后指数退避）
 2) 候选打分（不是 IF 硬规则）:
    score = 0.55*兴趣强度 + 0.25*新鲜度 + 0.20*情境契合(话题/时段)
             - 重复惩罚(最近 N 次做过) + 随机抖动
 3) 按权重采样（不是取最大值），并允许"什么都不做"（chat/none 固定占一定权重）
 4) 预算检查：单次 run 最多 tool_calls（如 6），失败 2 次即中止
 5) 记账：activity_intents(outcome=executed/skipped) → 执行 → activity_runs
```

关键约束：
- **不做"必须完成"**：`none` 权重 ≥ 0.35，允许她选择聊天或安静。
- **不刷工具**：单次 run 的工具调用上限 + 失败熔断 + 每次主动机会最多一个活动。
- **用户要求不记为 self_choice**：源消息命中"你去玩玩看/帮我测试"→ `user_request`，不进自主统计。
- **系统计划**（如定时刷空间）标 `system_plan`，也不计入自主。

## 5. 开关、日志、降级、回滚

| 项 | 设计 |
| --- | --- |
| 总开关 | `socialV2.autonomy.enabled`（默认 false）；`observeOnly=true` 时只记录 intent、不执行 |
| 分级开关 | `autonomy.activities` 逐项启用；`autonomy.maxPerDay`；`autonomy.maxToolCallsPerRun` |
| 行为日志 | `state/autonomy.jsonl`：时机、gate 结果、候选与权重、选择、执行结果、耗时；**不记隐私正文** |
| 指标 | 选择率、执行成功率、兴趣确认率、被用户打断率、每条主动消息成本 |
| 失败恢复 | 工具失败 → 该活动冷却指数退避（5min→15min→1h），连续 3 次当日禁用；不影响聊天 |
| 降级 | 任何异常 → 直接跳过本时机（fail-closed），不重试轰炸 |
| 回滚 | 关开关即停；兴趣影响可通过 `trait_versions` 回滚；`activity_*` 表只增不改，可整表删除 |

## 6. 与现有机制的边界

- **不改** 角色卡、六项初始性格、爸爸身份规则、120k 轮换阈值、`observeOnly`。
- **不降** 证据门槛；选择权重不写回 strength，强度仍只由真实证据与衰减决定。
- **不复用** 工具调用次数当"参与"：只读工具仍是 explore（本轮已修）。
- 主动活动产生的真实操作才记 participate，且**必须带 conv_key / 事件 id**（本轮已修）。

## 7. 分阶段上线

1. **影子模式**（建议先跑 3 天）：`enabled=true, mode=shadow`，只写 intent 与 gate 结果，不执行、不打扰。
2. 复盘：看"如果执行会选什么"是否合理、是否集中在某个活动（重复偏好风险）。
3. 灰度：只开 `watch_bili` 这类低风险活动，`maxPerDay=1`。
4. 全量：按指标再放开；保留一键关闭。

## 8. 待决策问题

1. 主动机会复用现有 wake 时机，还是单独调度？（建议先复用，减少新变量）
2. "新鲜度"如何定义：N 天没做 + 有探索信号？
3. 用户在场时是否允许自主活动？（建议：有未读/刚说话时一律不做）
4. 是否允许主动活动产生"未请求的消息"？（建议：仅当活动有可分享内容且不刷屏，最多 1 条）

## 9. 明确不做

- 不为"看起来有成长"而强行安排活动。
- 不根据角色卡/提示词填充共同话题或兴趣。
- 不把"执行成功"当成"兴趣确认"。
