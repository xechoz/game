---
name: flight-ludo
description: >
  Use ONLY when working on this vue-pixi-game-template repository, a Vue 3 +
  PixiJS 8 flight-ludo (飞行棋) mini game. Triggers: flight-ludo, 飞行棋,
  boardRenderer, movePiece, rollDice, useFlightLudoPlayScene, 棋盘预设,
  board-presets, 修改规则 / 加难度 / 改骰子或棋子动画 / 新增语言或资源,
  src/game, src/composables, difficulty, safeCells, flightJumps, 吃子, 跳子.
  Provides the three-layer architecture, rule state machine mapping, renderer
  conventions, known pitfalls, and code-style hard rules so work lands in the
  right file with the right invariants on the first pass.
---

# flight-ludo 项目技能

## 1. 项目速览

- **技术栈**：Vue 3（Composition API）+ TypeScript + PixiJS 8 + Vite 8
- **游戏**：飞行棋（Flight Ludo），1~4 名玩家（其余 AI 托管），三档棋盘难度
- **页面流转**：`prepare`（选模式 1~4P）→ `play`（PIXI 场景）→ `result`（结果覆盖层）
  - play/result 页面组件懒加载（`defineAsyncComponent`），结果页叠加在游戏页之上，背后棋盘不重建
  - 页面路由在 `src/App.vue`（`page` ref + v-if），全局配置（mode/piecesPerPlayer/boardPresetId/autoPlayMode）也在这里

## 2. 三层架构铁律（最重要）

```
① 纯逻辑层  src/game/            规则状态机，无 Vue/PIXI 依赖
② 控制器层  src/composables/      编排时机、驱动动画、管理定时器
③ 渲染层    flight-ludo-play-scene/boardRenderer.ts   纯 PIXI 绘制与交互
```

- **① 规则层**：`GameState` 是**唯一数据源**，所有函数就地修改 state 并返回结果信息。**不得 import Vue 或 PixiJS**（只依赖 `../i18n` 与 `./board-presets.ts`）。外部统一从 `src/game/index.ts` 桶导入。
- **② 控制器层**：`useFlightLudoPlayScene.ts` 总调度持有 `game` ref，组装三个子控制器。三者**循环注入**（turn 调 dice/move，dice/move 又回调 turn 安排下一步），通过闭包延迟调用实现——这是刻意设计，不要试图"解开"。
- **③ 渲染层**：读 `GameState` + 控制器的动画 ref 绘制，不维护任何游戏进度。
- 数据流：**规则层状态变化 → 控制器安排动画时机 → `renderScene()` 同步到 PIXI**。

### progress 坐标模型（全项目一致）

- `progress <= 0` → 停机坪 base（只有掷出 6 才能起飞）
- `1 ~ trackLength` → 外圈跑道 track
- `trackLength+1 ~ finishStep` → 终点跑道 home（不再与外圈交互、不能被吃）
- `>= finishStep` → finished（胜利判定用）

## 3. 规则要点对照（改规则时先看这里）

全部在 `src/game/flight-ludo.ts`：

| 规则 | 位置/要点 |
|---|---|
| 起飞 | `canPieceMove`：停机坪棋子仅 `dice === 6` 可动 |
| 加权骰子 | `getWeightedDiceRoll`：无子在外圈时 6 概率 50%，否则均匀 1~6 |
| 移动 + 跳子 | `movePiece` 的 while 循环，按 `flightJumps` 连续顺移 |
| 吃子 | 落点非安全格（`safeCells[playerIndex]`）→ 同格敌方棋子送回停机坪 |
| 连走 | 掷 6 或吃子 → `advancePending=false`（不推进回合） |
| 回合推进 | `advanceTurn`；`MoveResult.advancePending=true` 时由控制器 `scheduleTurnAdvance` |
| 无子可走 | `rollDice` 的 `skipped` 分支：立即 advanceTurn |
| 胜利 | `movePiece` 的 finishedCount 检查 |
| 轨迹 | `buildMoveTrajectory`（progress 序列，动画逐帧回放用） |
| 托管选子 | `chooseAutoMovePieceId`：走得最远优先，平局取出发靠前 |

`MoveResult` 语义：`moved / advancePending / victory / capturedCount / capturedPieceIds / message`。

## 4. 棋盘预设体系（`src/game/board-presets.ts`）

| 预设 | 每边格数 | 跑道长 | 终点跑道 | 说明 |
|---|---|---|---|---|
| `tiny-3` 快速 | 3 | 8 | 2 | 默认 |
| `normal-5` 标准 | 5 | 16 | 4 | |
| `hell-7` 地狱 | 7 | 22 | 5 | 起点在边中点，safeCells 需硬编码 |

- 跑道长默认 `4×(每边格数-1)`，7 格有硬编码例外（`deriveOuterLength`）
- `BoardRenderLayout` 是纯渲染比例参数（与规则无关）
- **新增难度**：改 `board-presets.ts`（类型/预设/渲染比例/注册表）+ `PlayScreen.vue` 的 `difficultyOptions`（配图），并在 `getBoardPreset`/`getBoardRenderLayout` 默认链生效

## 5. 渲染/动画约定

- **分层**：`STATIC_LAYER`（棋盘，`buildStaticBoardKey` 变化才重建）+ `DYNAMIC_LAYER`（棋子/骰子/效果，每帧同步）；动态层内再分 基地块/效果/骰子 三个叠加层
- **命名复用**：所有节点固定 `label` 命名，按名查找/复用（简易命令式 diff），避免频繁创建销毁
- **棋子堆叠**：同格按 `getStackOffsets` 错位 + `getStackScale` 缩小
- **骰子动画状态**：`diceController` 暴露一组 ref（`diceSpinScale/diceLandingLift/diceIdlePulse/...`），渲染层叠加变换；高频动画走 `syncDiceOnly()` 轻量同步，其余走 `renderScene()`
- **被吃飞行**：`boardRenderer.FailAnim.ts` 纯状态计算（缓动 + 弧线 + 渐隐）
- **PIXI 防竞态**：`useFlightLudoPlayScene` 用 `pixiInitToken` 校验异步初始化是否过期；`ensurePixiReady()` 幂等
- **交互**：可走棋子 / 可摇骰基地绑定 `pointerdown`，动画期间自动禁用（`canRoll`/`legalPieces` 推导）

## 6. 常见任务 → 改动位置

| 任务 | 改哪里 |
|---|---|
| 改规则（吃子/跳子/连走等） | `src/game/flight-ludo.ts`（规则）+ `board-presets.ts`（数据） |
| 加棋盘难度 | `board-presets.ts` + `PlayScreen.vue` difficultyOptions |
| 改骰子/棋子动画 | `diceController.ts` / `moveController.ts`（动画状态）+ `boardRenderer.ts`（绘制） |
| 改回合节奏/托管行为 | `turnController.ts`（delay 参数） |
| 加语言 | `src/locales/` 新增 JSON + `i18n.ts` 的 `supportedLocales` 注册 |
| 换贴图/音效 | 替换 `public/` 同名资源（棋子贴图在 `ensurePixiReady` 加载） |
| 上传素材 | `npm run upload-server`（http://127.0.0.1:8008） |

## 7. 命令与已知坑

```bash
npm run dev              # 开发
npm run build            # vue-tsc 类型检查 + 打包
npm run lint             # ESLint
npm run format           # Prettier 格式化
npm run upload-server    # 资源上传服务器
```

- ⚠️ `npm run test:board-presets` **是坏的**：脚本指向不存在的 `src/game/board-presets.test.ts`，且 `node_modules` 里未安装 ts-node。真实测试在 `tests/flight-ludo-roll.mjs`（规则层单测）。别依赖该脚本，也不要被它吓到。
- ⚠️ `npm run format:check` 全量检查非 clean：`tests/`、`uploads/` 等遗留文件本就不符合 prettier。改完代码后只对自己改的文件跑 `npx prettier --write`。
- 编译报错先查 `npm run build`；ESLint 规则见 `eslint.config.js`。

## 8. 代码风格硬规则（`.github/instructions/`，违反即改）

1. **不做防御式编程**：内部逻辑/类型安全可保证处不加多余 `if`、默认值、容错；只在外部输入/边界条件处加保护。
2. **大文件拆分**：TS 文件 ≤500 行、Vue ≤800 行；超限拆子文件，命名体现层级（`Foo`、`Foo.Bar`）。
3. **默认非空类型**：不用 `null`/`?` 逃避类型错误；必要时用明确联合类型（如 `string | undefined`）并说明理由。

## 9. 参考

- 完整架构说明：`docs/ARCHITECTURE.md`（目录总览、控制器协作、渲染要点、扩展指南）
- 核心规则文件：`src/game/flight-ludo.ts`（已带中文注释）
- 总调度：`src/composables/useFlightLudoPlayScene.ts`（已带中文注释）
