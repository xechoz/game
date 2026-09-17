import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import * as PIXI from 'pixi.js'

import {
  type BoardPresetId,
  type BoardRenderLayout,
  type GameMode,
  type GameState,
  clampPiecesPerPlayer,
  createGame,
  getBoardPreset,
  getBoardRenderLayout,
  getCurrentPlayer,
  getLegalPieceIds,
} from '../game'
import {
  renderPlayScene,
  resolvePiecePoint as resolveBoardPiecePoint,
  syncDiceOnly,
} from './flight-ludo-play-scene/boardRenderer'
import { buildBoardLayout } from './flight-ludo-play-scene/boardLayout'
import { createDiceController } from './flight-ludo-play-scene/diceController'
import { createMoveController } from './flight-ludo-play-scene/moveController'
import { createSceneAudio } from './flight-ludo-play-scene/sceneAudio'
import { createTurnController } from './flight-ludo-play-scene/turnController'
import type { BoardLayout } from './flight-ludo-play-scene/types'

export type AppPage = 'prepare' | 'play' | 'result'

// 游戏宿主：canvas 挂载点（由 PlayScreen.vue 通过 ref 暴露）
interface PlayScreenHost {
  canvasEl: HTMLDivElement | null
}

interface UseFlightLudoPlaySceneOptions {
  page: Ref<AppPage>
  mode: Ref<GameMode>
  piecesPerPlayer: Ref<number>
  boardPresetId: Ref<BoardPresetId>
  autoPlayMode: Ref<boolean>
  playScreenRef: Ref<PlayScreenHost | null>
}

export function useFlightLudoPlayScene(options: UseFlightLudoPlaySceneOptions) {
  const canvasEl = computed(() => options.playScreenRef.value?.canvasEl ?? null)
  // 唯一数据源：一局游戏的完整状态
  const game = ref<GameState>(
    createGame({
      mode: options.mode.value,
      piecesPerPlayer: options.piecesPerPlayer.value,
      boardPresetId: options.boardPresetId.value,
    }),
  )
  const currentPlayer = computed(() => getCurrentPlayer(game.value))
  const legalPieces = computed(() => getLegalPieceIds(game.value))
  const winner = computed(() =>
    game.value.winnerIndex === -1
      ? null
      : game.value.players[game.value.winnerIndex],
  )
  // 对局会话进行中（含刚开局尚未走子）：用于顶栏防误触锁定
  const gameActive = computed(() => game.value.winnerIndex === -1)
  // 本局是否已掷过骰子（首次掷骰后顶栏立即回锁；dice 每回合重置为 0，需持久标记）
  const hasRolledOnce = ref(false)
  watch(
    () => game.value.dice,
    (value) => {
      if (value > 0) hasRolledOnce.value = true
    },
  )
  const boardPreset = computed(() => getBoardPreset(game.value.boardPresetId))
  const boardRenderLayout = computed<BoardRenderLayout>(() =>
    getBoardRenderLayout(game.value.boardPresetId),
  )

  const assetBase = import.meta.env.BASE_URL
  function assetUrl(name: string) {
    return `${assetBase}${name}`
  }

  const {
    disposeAudio,
    playFailSound,
    playMoveSound,
    playRollSound,
    playWinSound,
    startBackgroundMusic,
  } = createSceneAudio(assetUrl)

  // —— PIXI 实例与缓存 ——
  // pixiInitToken：每次清理时自增，异步初始化完成后通过它校验自己是否"过期"，防止竞态
  let app: PIXI.Application | null = null
  let scene: PIXI.Container | null = null
  let pieceTexture: PIXI.Texture | null = null
  let playerPieceTextures: Partial<Record<number, PIXI.Texture>> = {}
  let currentLayout: BoardLayout | null = null
  let currentLayoutCacheKey = ''
  let appInitPromise: Promise<void> | null = null
  let pixiInitToken = 0

  // 布局缓存 key：棋盘几何只随 预设 + 画布尺寸 + 渲染比例 变化，命中即复用
  function getBoardLayoutCacheKey(width: number, height: number) {
    const preset = boardPreset.value
    const renderLayout = boardRenderLayout.value

    return [
      game.value.boardPresetId,
      width,
      height,
      preset.trackLength,
      preset.stepsPerEdge,
      preset.homeSteps,
      renderLayout.trackInsetRatio,
      renderLayout.baseSlotSpreadRatio,
      renderLayout.baseZonePaddingRatio,
      renderLayout.finishGapRatio,
    ].join(':')
  }

  // 获取（或按需构建）当前画布尺寸下的棋盘几何布局
  function getCurrentBoardLayout() {
    if (!app) return null

    const { width, height } = app.screen
    const layoutCacheKey = getBoardLayoutCacheKey(width, height)
    if (currentLayout && currentLayoutCacheKey === layoutCacheKey) {
      return currentLayout
    }

    // 棋盘取画布短边（留 20px 边距），居中放置
    const boardSize = Math.min(width, height) - 20
    const safeBoardSize = Math.max(240, boardSize)
    const originX = (width - safeBoardSize) / 2
    const originY = (height - safeBoardSize) / 2

    currentLayout = buildBoardLayout(
      originX,
      originY,
      safeBoardSize,
      boardPreset.value,
      boardRenderLayout.value,
    )
    currentLayoutCacheKey = layoutCacheKey

    return currentLayout
  }

  function isPlayPageActive() {
    return options.page.value === 'play'
  }

  function getPlayerPieceTexture(playerIndex: number) {
    return playerPieceTextures[playerIndex] ?? pieceTexture
  }

  // 全量渲染入口：把 game 状态 + 各控制器的动画状态一次性同步到 PIXI 场景
  function renderScene() {
    if (!app || !scene) return

    const layout = getCurrentBoardLayout()
    if (!layout) return

    currentLayout = renderPlayScene({
      app,
      scene,
      layout,
      boardPreset: boardPreset.value,
      boardRenderLayout: boardRenderLayout.value,
      game: game.value,
      legalPieces: legalPieces.value,
      winner: winner.value,
      autoPlayMode: options.autoPlayMode.value,
      dice: {
        isRolling: diceController.isRolling.value,
        diceSpinScale: diceController.diceSpinScale.value,
        diceSpinRotation: diceController.diceSpinRotation.value,
        diceSpinFlip: diceController.diceSpinFlip.value,
        diceLandingLift: diceController.diceLandingLift.value,
        diceLandingSquash: diceController.diceLandingSquash.value,
        diceResultPop: diceController.diceResultPop.value,
        diceIdlePulse: diceController.diceIdlePulse.value,
        idleRipple: diceController.idleRipple.value,
        getDiceDisplayValue: diceController.getDiceDisplayValue,
      },
      move: {
        replayingPieceId: moveController.replayingPieceId.value,
        movePath: moveController.movePath.value,
        replayingStartProgress: moveController.replayingStartProgress.value,
        movingPoint: moveController.movingPoint.value,
        landingPoint: moveController.landingPoint.value,
        capturedFlights: moveController.capturedFlights.value,
      },
      turn: {
        legalPulse: turnController.legalPulse.value,
        isTurnTransitioning: turnController.isTurnTransitioning.value,
        diceHandoffHiding: turnController.diceHandoffHiding.value,
        isHumanTurn: turnController.isHumanTurn,
      },
      onRoll: diceController.handleRoll,
      onMove: moveController.handleMove,
      getPlayerPieceTexture,
    })
  }

  // 轻量渲染：骰子动画高频刷新时只同步骰子层，避免整场重绘
  function syncDiceScene() {
    if (!app || !scene) return

    syncDiceOnly({
      app,
      scene,
      game: game.value,
      autoPlayMode: options.autoPlayMode.value,
      dice: {
        isRolling: diceController.isRolling.value,
        diceSpinScale: diceController.diceSpinScale.value,
        diceSpinRotation: diceController.diceSpinRotation.value,
        diceSpinFlip: diceController.diceSpinFlip.value,
        diceLandingLift: diceController.diceLandingLift.value,
        diceLandingSquash: diceController.diceLandingSquash.value,
        diceResultPop: diceController.diceResultPop.value,
        diceIdlePulse: diceController.diceIdlePulse.value,
        idleRipple: diceController.idleRipple.value,
        getDiceDisplayValue: diceController.getDiceDisplayValue,
      },
      move: {
        replayingPieceId: moveController.replayingPieceId.value,
        movePath: moveController.movePath.value,
        replayingStartProgress: moveController.replayingStartProgress.value,
        movingPoint: moveController.movingPoint.value,
        landingPoint: moveController.landingPoint.value,
        capturedFlights: moveController.capturedFlights.value,
      },
      turn: {
        legalPulse: turnController.legalPulse.value,
        isTurnTransitioning: turnController.isTurnTransitioning.value,
        diceHandoffHiding: turnController.diceHandoffHiding.value,
        isHumanTurn: turnController.isHumanTurn,
      },
      onRoll: diceController.handleRoll,
    })
  }

  /**
   * 视图刷新总入口（所有规则/动画阶段结束后都会调用）：
   *  - 触发重渲染
   *  - 同步骰子空闲动画与回合高亮动画
   *  - 出现胜利者时跳转结果页（可 defer 等胜利动画播完）
   *  - 仍在游戏页则驱动自动托管继续走
   */
  function refreshGameView(viewOptions?: { deferResultPage?: boolean }) {
    game.value = { ...game.value }
    renderScene()
    diceController.syncDiceIdleAnimation()
    turnController.syncTurnAccentAnimation()
    if (game.value.winnerIndex !== -1 && !viewOptions?.deferResultPage) {
      options.page.value = 'result'
    }
    if (isPlayPageActive()) {
      turnController.playAutoTurn()
    } else {
      turnController.clearAutoTimers()
    }
  }

  // 清理全部计时器/动画帧（离开页面、重开对局时调用）
  function clearTimers() {
    diceController.clearRollTimers()
    moveController.clearMoveTimers()
    turnController.clearTurnTimers()
    diceController.stopDiceIdleAnimation()
  }

  // —— 子控制器组装 ——
  // 注意三者互相注入依赖形成循环引用（通过闭包延迟调用），是刻意的设计：
  // turn 调度 dice/move 的时机，dice/move 又回调 turn 安排下一步
  const turnController = createTurnController({
    game,
    currentPlayer,
    legalPieces,
    autoPlayMode: options.autoPlayMode,
    isRolling: computed(() => diceController.isRolling.value),
    movingPoint: computed(() => moveController.movingPoint.value),
    isPlayPageActive,
    renderScene,
    refreshGameView,
    clearTimers,
    handleRoll: (fromAuto = false) => diceController.handleRoll(fromAuto),
    handleMove: (pieceId) => moveController.handleMove(pieceId),
  })

  const moveController = createMoveController({
    game,
    legalPieces,
    diceHandoffHiding: turnController.diceHandoffHiding,
    getCurrentLayout: () => currentLayout,
    resolvePiecePoint: (layout, player, piece) =>
      resolveBoardPiecePoint(layout, boardPreset.value, player, piece),
    clearTimers,
    renderScene,
    refreshGameView,
    scheduleTurnAdvance: turnController.scheduleTurnAdvance,
    playFailSound,
    playMoveSound,
    playWinSound,
  })

  const diceController = createDiceController({
    game,
    autoPlayMode: options.autoPlayMode,
    movingPoint: moveController.movingPoint,
    diceHandoffHiding: turnController.diceHandoffHiding,
    isTurnTransitioning: turnController.isTurnTransitioning,
    isPlayPageActive,
    isHumanTurn: turnController.isHumanTurn,
    clearTimers,
    renderScene,
    syncDiceScene,
    refreshGameView,
    scheduleAutoTurn: turnController.scheduleAutoTurn,
    scheduleAutoMove: turnController.scheduleAutoMove,
    scheduleTurnAdvance: turnController.scheduleTurnAdvance,
    getHumanAutoMovePieceId: turnController.getHumanAutoMovePieceId,
    handleMove: moveController.handleMove,
    playRollSound,
  })

  /**
   * 确保 PIXI 应用已就绪（幂等）：
   *  - 已初始化且挂在当前宿主 → 直接返回
   *  - 初始化进行中 → 等待同一 promise
   *  - 否则异步创建 Application + 加载棋子贴图
   * 初始化完成后用 pixiInitToken 校验是否过期（页面已切换/被清理），过期则销毁
   */
  async function ensurePixiReady() {
    if (!canvasEl.value) return

    if (app && scene) {
      if (app.canvas.parentElement !== canvasEl.value) {
        canvasEl.value.appendChild(app.canvas)
        renderScene()
      }
      return
    }

    if (appInitPromise) {
      await appInitPromise
      return
    }

    const host = canvasEl.value
    if (!host) return

    appInitPromise = (async () => {
      const initToken = ++pixiInitToken
      const nextApp = new PIXI.Application()
      await nextApp.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })

      if (
        initToken !== pixiInitToken ||
        !isPlayPageActive() ||
        canvasEl.value !== host
      ) {
        nextApp.destroy(true)
        return
      }

      app = nextApp
      host.appendChild(app.canvas)
      scene = new PIXI.Container()
      app.stage.addChild(scene)

      const [redPiece, yellowPiece, bluePiece, greenPiece] = await Promise.all([
        PIXI.Assets.load(assetUrl('player-red.png')),
        PIXI.Assets.load(assetUrl('player-yellow.png')),
        PIXI.Assets.load(assetUrl('player-blue.png')),
        PIXI.Assets.load(assetUrl('player-green.png')),
      ])
      if (initToken !== pixiInitToken || !app || !scene) return
      playerPieceTextures = {
        0:
          redPiece instanceof PIXI.Texture
            ? redPiece
            : PIXI.Texture.from(assetUrl('player-red.png')),
        1:
          yellowPiece instanceof PIXI.Texture
            ? yellowPiece
            : PIXI.Texture.from(assetUrl('player-yellow.png')),
        2:
          bluePiece instanceof PIXI.Texture
            ? bluePiece
            : PIXI.Texture.from(assetUrl('player-blue.png')),
        3:
          greenPiece instanceof PIXI.Texture
            ? greenPiece
            : PIXI.Texture.from(assetUrl('player-green.png')),
      }
      pieceTexture =
        playerPieceTextures[0] ??
        playerPieceTextures[1] ??
        playerPieceTextures[2] ??
        playerPieceTextures[3] ??
        null
    })()

    try {
      await appInitPromise
    } finally {
      appInitPromise = null
    }

    renderScene()
  }

  // 重开一局：重建纯逻辑状态并清空所有动画残留
  function restartGame() {
    game.value = createGame({
      mode: options.mode.value,
      piecesPerPlayer: clampPiecesPerPlayer(options.piecesPerPlayer.value),
      boardPresetId: options.boardPresetId.value,
    })
    hasRolledOnce.value = false
    moveController.clearMovePreview()
    clearTimers()
    diceController.resetDiceState()
    renderScene()
    diceController.syncDiceIdleAnimation()
    turnController.syncTurnAccentAnimation()
  }

  // 从准备页开始对局：切页 → 重开 → 确保 PIXI 就绪 → 启动 BGM，托管玩家自动开局
  async function startGame() {
    options.page.value = 'play'
    restartGame()
    await nextTick()
    await ensurePixiReady()
    startBackgroundMusic()
    renderScene()
    if (!turnController.isHumanTurn() && options.autoPlayMode.value) {
      turnController.scheduleAutoTurn(260)
    }
  }

  // 结果页"再玩一次"：留在 play 页直接重开
  async function replayGame() {
    options.page.value = 'play'
    restartGame()
    await nextTick()
    await ensurePixiReady()
    renderScene()
    if (!turnController.isHumanTurn() && options.autoPlayMode.value) {
      turnController.scheduleAutoTurn(260)
    }
  }

  function goToPrepare() {
    options.page.value = 'prepare'
    restartGame()
  }

  function setMode(nextMode: GameMode) {
    options.mode.value = nextMode
  }

  function setPiecesPerPlayer(nextCount: number) {
    options.piecesPerPlayer.value = nextCount
  }

  function setBoardPresetId(nextBoardPresetId: BoardPresetId) {
    options.boardPresetId.value = nextBoardPresetId
  }

  // 释放 PIXI 资源（组件卸载时）：token 自增使未完成的异步初始化失效
  function cleanupPixi() {
    pixiInitToken += 1
    clearTimers()
    disposeAudio()
    if (app) {
      app.destroy(true)
      app = null
      scene = null
      currentLayout = null
    }
  }

  // 配置变化（模式/棋子数/棋盘预设）→ 重开对局
  watch(
    [options.mode, options.piecesPerPlayer, options.boardPresetId],
    restartGame,
  )

  // 自动托管驱动器：监听 玩家/骰子/胜利/autoPlayMode 变化，
  // 只要轮到非真人玩家且无动画占用，就安排自动回合
  watch(
    () =>
      [
        game.value.currentPlayerIndex,
        game.value.dice,
        game.value.winnerIndex,
        options.autoPlayMode.value,
      ] as const,
    () => {
      if (!isPlayPageActive() || game.value.winnerIndex !== -1) {
        clearTimers()
        return
      }

      if (!options.autoPlayMode.value) {
        turnController.clearAutoTimers()
        return
      }

      if (
        turnController.isHumanTurn() ||
        diceController.isRolling.value ||
        moveController.movingPoint.value !== null
      ) {
        return
      }

      turnController.scheduleAutoTurn(220)
    },
    { immediate: true },
  )

  onMounted(() => {
    if (options.page.value === 'play') {
      void nextTick().then(() => ensurePixiReady())
    }
  })

  watch(canvasEl, async () => {
    if (options.page.value !== 'play') return
    await nextTick()
    await ensurePixiReady()
    renderScene()
  })

  watch(options.page, async (nextPage) => {
    if (nextPage === 'play') {
      await nextTick()
      await ensurePixiReady()
      renderScene()
    } else {
      clearTimers()
    }
  })

  onBeforeUnmount(() => {
    cleanupPixi()
  })

  return {
    currentPlayer,
    legalPieces,
    winner,
    gameActive,
    hasRolledOnce,
    restartGame,
    startGame,
    replayGame,
    goToPrepare,
    setMode,
    setPiecesPerPlayer,
    setBoardPresetId,
  }
}
