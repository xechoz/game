# 项目架构说明（vue-pixi-game-template）

一个基于 **Vue 3 + TypeScript + PixiJS 8 + Vite** 的飞行棋（Flight Ludo）小游戏。
支持 1~4 名玩家（其余为 AI 托管）、三档棋盘难度（快速/标准/地狱）、多语言（zh/en）。

## 1. 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| UI 框架 | Vue 3（`<script setup>` + Composition API） | 页面切换、交互、响应式状态 |
| 渲染 | PixiJS 8 | Canvas 游戏场景（棋盘/棋子/骰子/动画） |
| 语言 | TypeScript ~6.0 | 全链路类型约束 |
| 构建 | Vite 8 | dev / build / 分包懒加载 |
| 质量 | ESLint + Prettier + vue-tsc | 代码规范与类型检查 |
| 测试 | node:test + ts-node（`tests/`） | 规则层单测 |
| 部署 | GitHub Actions → GitHub Pages | main 分支自动发布 |

## 2. 目录结构总览

```
├── src/
│   ├── main.ts                     # 入口：挂载 App
│   ├── App.vue                     # 页面路由（prepare→play→result）+ 全局配置
│   ├── style.css                   # 全局样式
│   ├── i18n.ts                     # 轻量 i18n（zh/en，{param} 模板）
│   ├── locales/
│   │   ├── zh.json                 # 中文字条
│   │   └── en.json                 # 英文字条
│   ├── game/                       # ★ 纯游戏逻辑层（无 Vue/PIXI 依赖）
│   │   ├── flight-ludo.ts          #   规则状态机（核心）
│   │   ├── board-presets.ts        #   棋盘预设 + 渲染比例参数
│   │   └── index.ts                #   桶导出
│   ├── composables/
│   │   ├── useFlightLudoPlayScene.ts          # ★ 场景总调度（PIXI 生命周期 + 控制器组装）
│   │   └── flight-ludo-play-scene/
│   │       ├── turnController.ts   #   回合编排 + 自动托管时间线
│   │       ├── diceController.ts   #   骰子动画与摇骰流程
│   │       ├── moveController.ts   #   棋子移动动画 + 被吃飞行动画
│   │       ├── boardRenderer.ts    #   ★ PIXI 渲染层（分层 diff 渲染 + 交互）
│   │       ├── boardLayout.ts      #   棋盘几何计算（预设 → 像素坐标）
│   │       ├── boardRenderer.FailAnim.ts  # 被吃飞行状态计算
│   │       ├── boardView.ts        #   UI 锚点提取（编号/标注用）
│   │       ├── homeConnector.ts    #   停机坪→终点连接线参数
│   │       ├── sceneAudio.ts       #   音效（BGM + Web Audio 合成音）
│   │       └── types.ts            #   共享类型
│   └── components/game/
│       ├── PrepareScreen.vue       # 准备页（选 1~4P 开始）
│       ├── PlayScreen.Content.vue  # 游戏页壳（接线 composable，懒加载）
│       ├── PlayScreen.vue          # 游戏页 UI（canvas 宿主 + 难度切换）
│       └── ResultScreen.vue        # 结果页（胜利展示 + 重开/返回）
├── public/                         # 静态资源（贴图/音效/背景）
├── tests/
│   └── flight-ludo-roll.mjs        # 规则层单测
├── uploads/                        # 开发用资源上传服务器（LAN 传素材）
│   └── upload_server.js
├── uploads_server.py               # 同上的 Python 简易版
└── .github/workflows/deploy.yml    # GitHub Pages 自动部署
```

## 3. 三层架构

项目刻意把代码拆成三层，职责单向依赖：

```
┌─────────────────────────────┐
│  ① 纯逻辑层  src/game/       │  ← 状态机、规则、无任何渲染依赖
│     GameState / movePiece    │
└──────────────┬──────────────┘
               │ 读写 game ref
┌──────────────▼──────────────┐
│  ② 控制器层  src/composables/ │  ← 编排时机、驱动动画、管理定时器
│     turn / dice / move       │  （互相注入，形成闭环）
└──────────────┬──────────────┘
               │ renderScene() / syncDiceOnly()
┌──────────────▼──────────────┐
│  ③ 渲染层  flight-ludo-play- │  ← 纯 PIXI 绘制与交互绑定
│     scene/boardRenderer.ts   │
└─────────────────────────────┘
```

数据流：**规则层产生状态变化 → 控制器安排动画时机 → 渲染层把状态画出来**。

- 规则层绝不 import 控制器/渲染层，控制器与渲染层只从 `src/game/index.ts` 取 API。
- `GameState` 是唯一数据源：渲染层不自己维护任何游戏进度，只读取并绘制。
- 控制器之间的"循环依赖"（turn 调 dice、dice 又回调 turn）是通过闭包延迟调用实现的刻意设计，见 `useFlightLudoPlayScene.ts` 的组装区。

## 4. 核心规则实现对照

| 规则 | 位置 |
|---|---|
| 起飞（掷 6 才能出停机坪） | `flight-ludo.ts` → `canPieceMove` |
| 加权骰子（无子时偏 6） | `getWeightedDiceRoll` |
| 移动 + 跳子点连续顺移 | `movePiece`（while 循环处理 `flightJumps`） |
| 吃子（落点非安全格） | `movePiece` 的 capture 段 |
| 掷 6 / 吃子可继续走 | `movePiece` 返回 `advancePending=false` |
| 回合推进 | `advanceTurn` |
| 胜利判定 | `movePiece` 的 finishedCount 检查 |
| 无子可走直接过回合 | `rollDice` 的 `skipped` 分支 |
| 移动轨迹（动画回放用） | `buildMoveTrajectory` |
| 托管选子策略 | `chooseAutoMovePieceId`（走得最远的优先） |

## 5. 棋盘预设体系

`board-presets.ts` 定义了三档难度，`BoardPreset` 提供规则与渲染需要的全部静态参数：

| 预设 | 每边格数 | 跑道长 | 终点跑道 | 说明 |
|---|---|---|---|---|
| `tiny-3` 快速 | 3 | 8 | 2 | 快速对局（默认） |
| `normal-5` 标准 | 5 | 16 | 4 | 标准对局 |
| `hell-7` 地狱 | 7 | 22 | 5 | 最长跑道，起点位于边中点 |

关键约定：
- `progress` 是棋子的统一进度坐标：`0`=停机坪，`1~trackLength`=外圈，`trackLength+1 ~ finish`=终点跑道。
- `safeCells[playerIndex]` 为该玩家安全格（含起点），落点在此不会被吃。
- `flightJumps` 为 `[格下标, 目标格]` 跳子映射（当前预设均为空，规则已支持）。
- 跑道长默认按 `4×(每边格数-1)` 推导，7 格时有硬编码例外保持对称。

## 6. 页面流转

```
App.vue (v-if 路由)
 ├─ prepare ───────────► play ──────────► result
 │  PrepareScreen          PlayPage          ResultScreen
 │  选 1~4P 点开始          （PIXI 场景）      "再玩一次" → play
 │                        （叠加层之上）      "返回"     → prepare
 └─────────────────────────────────────────
```

- play 与 result 页组件使用 `defineAsyncComponent` 懒加载（分包）。
- 结果页只是叠加在游戏页上的覆盖层，`PlayPage` 在 `page==='play'||'result'` 时保持挂载，背后棋盘不重建。
- 页面切换由 `App.vue` 的 `page` ref 驱动；`useFlightLudoPlayScene` 监听 `page` 变化做 PIXI 初始化和计时器清理。

## 7. 控制器协作方式

`useFlightLudoPlayScene.ts` 是总调度，持有 `game`（Ref\<GameState\>）并组装三个控制器：

- **turnController**：负责"什么时候该做什么"。`playAutoTurn()` 编排 摇骰→选子→移动；`scheduleTurnAdvance()` 延时推进回合；`scheduleAutoMove()` 执行延迟动作。
- **diceController**：`handleRoll()` 守卫后播放旋转动画，落定调规则层 `rollDice`，再按结果（skipped / 可代走 / advancePending / 托管继续）分派。
- **moveController**：`handleMove()` 先对全场做位置快照，调 `movePiece` 落定状态，再按 `buildMoveTrajectory` 逐格播放 hop 动画；被吃棋子生成"飞回停机坪"动画。

三者都通过注入的 `renderScene()` / `refreshGameView()` 把状态同步到渲染层，并在动画结束后驱动下一步。所有定时器统一由 `clearTimers()` 清理（离开页面、重开对局时）。

## 8. 渲染层要点（boardRenderer.ts）

- **分层**：`STATIC_LAYER`（棋盘，仅配置变化时重建）与 `DYNAMIC_LAYER`（棋子/骰子/效果，每帧同步）。动态层又分 基地块/效果/骰子 三个叠加层。
- **命名复用**：所有节点用固定 `label` 命名，按名查找/复用（简易命令式 diff），避免频繁创建销毁。
- **静态棋盘缓存**：`buildStaticBoardKey()` 汇总尺寸/预设/玩家信息生成 key，key 不变直接跳过重建。
- **交互**：可走棋子与可摇骰基地绑定 `pointerdown`；可移动/可摇骰状态由 `canRoll`、`legalPieces` 等推导，动画期间自动禁用。
- **棋子堆叠**：同格棋子按固定模式错位（`getStackOffsets`）并缩小（`getStackScale`）。

## 9. 目录文件说明

| 文件 | 职责 |
|---|---|
| `src/game/flight-ludo.ts` | 规则状态机：创建对局、摇骰、移动、吃子、跳子、胜利、回合推进 |
| `src/game/board-presets.ts` | 棋盘预设（三档难度）+ 渲染比例参数 + 安全格/跳子点 |
| `src/game/index.ts` | 对外统一出口（桶导出） |
| `src/composables/useFlightLudoPlayScene.ts` | 总调度：PIXI 生命周期、控制器组装、自动托管驱动、配置监听 |
| `.../flight-ludo-play-scene/boardLayout.ts` | 纯几何：预设 → 跑道点/停机坪槽/终点槽像素坐标 |
| `.../flight-ludo-play-scene/boardRenderer.ts` | 全部 PIXI 绘制与交互（静态棋盘、骰子、棋子、特效） |
| `.../turnController.ts` | 回合编排、自动托管时间线、回合切换动画状态 |
| `.../diceController.ts` | 骰子旋转/落定/空闲动画 + 摇骰流程 |
| `.../moveController.ts` | 棋子移动动画、被吃飞行动画、落点脉冲 |
| `.../sceneAudio.ts` | BGM 与合成音效（含失败降级） |
| `src/i18n.ts` + `locales/` | 手写 i18n：浏览器语言检测、`{param}` 模板替换 |
| `src/components/game/*.vue` | 四个页面组件 |
| `tests/flight-ludo-roll.mjs` | 规则层单测（加权骰子、起飞、跳过回合） |
| `uploads/upload_server.js` | 开发工具：LAN 文件上传服务器（`npm run upload-server`） |
| `.github/workflows/deploy.yml` | main 分支 push 后构建并部署到 GitHub Pages |

## 10. 常用命令

```bash
npm run dev              # 启动开发服务器
npm run build            # vue-tsc 类型检查 + 打包
npm run lint             # ESLint
npm run format           # Prettier 格式化
npm run format:check     # 格式检查
npm test                 # 注意：无全局 test 脚本，规则测试请用：
npm run test:board-presets   # 规则层单测（ts-node + node:test）
npm run upload-server    # 启动资源上传服务器（http://127.0.0.1:8008）
```

## 11. 扩展指南

- **加新棋盘难度**：在 `board-presets.ts` 增加 `BoardPresetId`、预设对象与渲染比例，并在 `PlayScreen.vue` 的 `difficultyOptions` 中加选项（配一张图）。
- **改规则**（如加入跳子/新的吃子条件）：只改 `src/game/flight-ludo.ts`（规则）与 `board-presets.ts`（数据），动画与渲染无需改动。
- **换贴图/音效**：替换 `public/` 下同名资源即可（棋子贴图在 `ensurePixiReady` 中加载）。
- **加语言**：在 `src/locales/` 新增 JSON 并在 `i18n.ts` 的 `supportedLocales` 注册。
- **资源管理**：开发中可用 `npm run upload-server` 把素材上传到本机 `uploads/` 目录。
