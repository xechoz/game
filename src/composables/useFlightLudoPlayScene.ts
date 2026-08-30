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

  let app: PIXI.Application | null = null
  let scene: PIXI.Container | null = null
  let pieceTexture: PIXI.Texture | null = null
  let playerPieceTextures: Partial<Record<number, PIXI.Texture>> = {}
  let currentLayout: BoardLayout | null = null
  let currentLayoutCacheKey = ''
  let appInitPromise: Promise<void> | null = null
  let pixiInitToken = 0

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

  function getCurrentBoardLayout() {
    if (!app) return null

    const { width, height } = app.screen
    const layoutCacheKey = getBoardLayoutCacheKey(width, height)
    if (currentLayout && currentLayoutCacheKey === layoutCacheKey) {
      return currentLayout
    }

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

  function clearTimers() {
    diceController.clearRollTimers()
    moveController.clearMoveTimers()
    turnController.clearTurnTimers()
    diceController.stopDiceIdleAnimation()
  }

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

  function restartGame() {
    game.value = createGame({
      mode: options.mode.value,
      piecesPerPlayer: clampPiecesPerPlayer(options.piecesPerPlayer.value),
      boardPresetId: options.boardPresetId.value,
    })
    moveController.clearMovePreview()
    clearTimers()
    diceController.resetDiceState()
    renderScene()
  }

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

  watch(
    [options.mode, options.piecesPerPlayer, options.boardPresetId],
    restartGame,
  )

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
    restartGame,
    startGame,
    replayGame,
    goToPrepare,
    setMode,
    setPiecesPerPlayer,
    setBoardPresetId,
  }
}
