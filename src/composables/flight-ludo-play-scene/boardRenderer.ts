/**
 * PIXI 渲染层（boardRenderer）
 *
 * 职责：把 GameState + 各控制器的动画状态渲染成 PIXI 场景，并绑定交互。
 *
 * 渲染模型：
 *  - 场景按名字分两个主层：STATIC_LAYER（静态棋盘，仅当棋盘配置变化时重建）
 *   和 DYNAMIC_LAYER（棋子/骰子/效果，每次 renderScene 全量 diff 同步）
 *  - 所有节点用固定 name 标识，按 name 查找复用或重建（简易"命令式 diff"）
 *  - 棋子组（pieceGroup）缓存在 sceneRenderStates 的 WeakMap 里，跨帧复用
 *  - 交互：可走棋子 / 可摇骰的基地块绑定 pointerdown → onMove / onRoll
 *
 * 对外只暴露三个入口：
 *  - renderPlayScene()  全量渲染
 *  - syncDiceOnly()     骰子动画高频轻量同步
 *  - resolvePiecePoint() 把 规则层位置(progress) 映射为像素坐标
 */
import * as PIXI from 'pixi.js'

import {
  getHomeLaneIndex,
  getPieceLocation,
  getTrackCellIndex,
  isSafeCell,
  type BoardPreset,
  type BoardRenderLayout,
  type GameState,
  type PieceState,
  type PlayerState,
} from '../../game'
import type { BoardLayout, LandingPoint, Point } from './types'
import { getCapturedFlightRenderState } from './boardRenderer.FailAnim'
import type { CapturedFlightState } from './boardRenderer.FailAnim'

type DiceRenderState = {
  isRolling: boolean
  diceSpinScale: number
  diceSpinRotation: number
  diceSpinFlip: number
  diceLandingLift: number
  diceLandingSquash: number
  diceResultPop: number
  diceIdlePulse: number
  idleRipple: number
  getDiceDisplayValue: () => number
}

type MoveRenderState = {
  replayingPieceId: string
  movePath: number[]
  replayingStartProgress: number
  movingPoint: Point | null
  landingPoint: LandingPoint | null
  capturedFlights: CapturedFlightState[]
}

type TurnRenderState = {
  legalPulse: number
  isTurnTransitioning: boolean
  diceHandoffHiding: boolean
  isHumanTurn: () => boolean
}

type RenderPlaySceneOptions = {
  app: PIXI.Application
  scene: PIXI.Container
  layout: BoardLayout
  boardPreset: BoardPreset
  boardRenderLayout: BoardRenderLayout
  game: GameState
  legalPieces: string[]
  winner: PlayerState | null
  autoPlayMode: boolean
  dice: DiceRenderState
  move: MoveRenderState
  turn: TurnRenderState
  onRoll: (fromAuto?: boolean) => void
  onMove: (pieceId: string) => void
  getPlayerPieceTexture: (playerIndex: number) => PIXI.Texture | null
}

type PieceRenderInfo = {
  player: RenderPlaySceneOptions['game']['players'][number]
  piece: RenderPlaySceneOptions['game']['players'][number]['pieces'][number]
  pieceIndex: number
  x: number
  y: number
  location: 'base' | 'track' | 'home' | 'finished'
  capturedFlight?: CapturedFlightState
}

type DiceSceneOptions = Pick<
  RenderPlaySceneOptions,
  | 'app'
  | 'scene'
  | 'game'
  | 'autoPlayMode'
  | 'dice'
  | 'move'
  | 'turn'
  | 'onRoll'
>

export function hexToNumber(color: string) {
  return Number.parseInt(color.replace('#', ''), 16)
}

type RippleRing = {
  progress: number
  alpha: number
}

function getRippleRings(phase: number, count = 2): RippleRing[] {
  return Array.from({ length: count }, (_, index) => {
    const progress = (phase + index / count) % 1
    return { progress, alpha: 1 - progress }
  })
}

// 骰子 6 个面的点数布局（以骰子中心为原点的归一化坐标）
const DIE_PIP_GRID = {
  left: -0.24,
  center: 0,
  right: 0.24,
  top: -0.24,
  middle: 0,
  bottom: 0.24,
} as const

const DIE_PIP_LAYOUTS: Record<number, Array<{ x: number; y: number }>> = {
  1: [{ x: DIE_PIP_GRID.center, y: DIE_PIP_GRID.middle }],
  2: [
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.bottom },
  ],
  3: [
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.center, y: DIE_PIP_GRID.middle },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.bottom },
  ],
  4: [
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.bottom },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.bottom },
  ],
  5: [
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.center, y: DIE_PIP_GRID.middle },
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.bottom },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.bottom },
  ],
  6: [
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.top },
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.middle },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.middle },
    { x: DIE_PIP_GRID.left, y: DIE_PIP_GRID.bottom },
    { x: DIE_PIP_GRID.right, y: DIE_PIP_GRID.bottom },
  ],
}

// —— 节点命名约定：全部场景节点用固定 label 命名，按名查找复用 ——
const OVERLAY_BASES_LAYER_NAME = 'flight-ludo-overlay-bases-layer'
const OVERLAY_EFFECTS_LAYER_NAME = 'flight-ludo-overlay-effects-layer'
const OVERLAY_DICE_LAYER_NAME = 'flight-ludo-overlay-dice-layer'
const DICE_CENTER_NAME = 'flight-ludo-dice-center'
const DICE_GROUP_NAME = 'flight-ludo-dice-group'
const DICE_SHADOW_NAME = 'flight-ludo-dice-shadow'
const DICE_FACE_NAME = 'flight-ludo-dice-face'
const DICE_FACE_DROP_SHADOW_NAME = 'flight-ludo-dice-face-shadow'
const DICE_FACE_PLATE_NAME = 'flight-ludo-dice-face-plate'
const DICE_FACE_GLOSS_NAME = 'flight-ludo-dice-face-gloss'
const DICE_IDLE_BACKDROP_NAME = 'flight-ludo-dice-idle-backdrop'
const DICE_QUESTION_MARK_NAME = 'flight-ludo-dice-question-mark'
const DICE_PIPS_LAYER_NAME = 'flight-ludo-dice-pips-layer'
const DICE_PROMPT_GLOW_NAME = 'flight-ludo-dice-prompt-glow'
const DICE_SETTLE_FLASH_NAME = 'flight-ludo-dice-settle-flash'
const DICE_PIP_NAME_PREFIX = 'flight-ludo-dice-pip'
const DICE_IDLE_RIPPLE_NAME = 'flight-ludo-dice-idle-ripple'

// 按 name 查找子节点；不存在则新建 Graphics（并可选插到指定层级），实现节点复用
function getOrCreateGraphicsChild(
  container: PIXI.Container,
  name: string,
  childIndex?: number,
) {
  const existing = findNamedChild(container, name)
  if (existing instanceof PIXI.Graphics) {
    if (
      typeof childIndex === 'number' &&
      container.getChildIndex(existing) !== childIndex
    ) {
      container.setChildIndex(existing, childIndex)
    }
    return existing
  }

  if (existing) {
    container.removeChild(existing)
    existing.destroy({ children: true })
  }

  const graphic = new PIXI.Graphics()
  graphic.label = name
  if (typeof childIndex === 'number') {
    container.addChildAt(graphic, childIndex)
  } else {
    container.addChild(graphic)
  }
  return graphic
}

function getOrCreateTextChild(
  container: PIXI.Container,
  name: string,
  factory: () => PIXI.Text,
) {
  const existing = findNamedChild(container, name)
  if (existing instanceof PIXI.Text) {
    return existing
  }

  if (existing) {
    container.removeChild(existing)
    existing.destroy({ children: true })
  }

  const text = factory()
  text.label = name
  container.addChild(text)
  return text
}

// 同步骰子面：按当前点数绘制圆角方块 + 点数圆点 + 高光 + 阴影
function syncDiceFaceGraphic(
  container: PIXI.Container,
  options: {
    size: number
    color: number
    value: number
    isIdle: boolean
    idlePulse: number
    isRolling: boolean
    diceLandingSquash: number
  },
) {
  const faceSize = options.size * 0.92
  const halfFace = faceSize / 2
  const cornerRadius = faceSize * 0.22
  const pipRadius = Math.max(3, faceSize * 0.072)
  const outlineAlpha = options.isIdle
    ? 0.8 + options.idlePulse * 0.14
    : options.isRolling
      ? 0.92
      : 0.88

  const shadow = getOrCreateGraphicsChild(
    container,
    DICE_FACE_DROP_SHADOW_NAME,
    0,
  )
  shadow.clear()
  shadow
    .roundRect(
      -halfFace,
      -halfFace + faceSize * 0.05,
      faceSize,
      faceSize,
      cornerRadius,
    )
    .fill({ color: 0x020617, alpha: 0.14 + options.diceLandingSquash * 0.08 })

  const plate = getOrCreateGraphicsChild(container, DICE_FACE_PLATE_NAME, 1)
  plate.clear()
  plate
    .roundRect(-halfFace, -halfFace, faceSize, faceSize, cornerRadius)
    .fill({ color: 0xffffff, alpha: 0.98 })
    .stroke({
      color: options.color,
      width: Math.max(2, faceSize * 0.05),
      alpha: outlineAlpha,
    })

  const gloss = getOrCreateGraphicsChild(container, DICE_FACE_GLOSS_NAME, 2)
  gloss.clear()
  gloss
    .roundRect(
      -faceSize * 0.28,
      -faceSize * 0.32,
      faceSize * 0.56,
      faceSize * 0.24,
      faceSize * 0.08,
    )
    .fill({ color: 0xffffff, alpha: 0.26 })

  const idleBackdrop = getOrCreateGraphicsChild(
    container,
    DICE_IDLE_BACKDROP_NAME,
  )
  idleBackdrop.visible = options.isIdle
  idleBackdrop.clear()
  if (options.isIdle) {
    idleBackdrop
      .circle(0, 0, faceSize * 0.17)
      .fill({ color: options.color, alpha: 0.08 + options.idlePulse * 0.05 })
  }

  const questionMark = getOrCreateTextChild(
    container,
    DICE_QUESTION_MARK_NAME,
    () => {
      const text = new PIXI.Text({
        text: '?',
        style: {
          fill: options.color,
          fontFamily: 'Trebuchet MS',
          fontSize: faceSize * 0.42,
          fontWeight: '800',
        },
      })
      text.anchor.set(0.5)
      return text
    },
  )
  questionMark.visible = options.isIdle
  questionMark.text = '?'
  questionMark.position.set(0, -faceSize * 0.02)
  questionMark.style.fill = options.color
  questionMark.style.fontFamily = 'Trebuchet MS'
  questionMark.style.fontSize = faceSize * 0.42
  questionMark.style.fontWeight = '800'

  const pipsLayer = getOrCreateSceneLayer(container, DICE_PIPS_LAYER_NAME)
  pipsLayer.visible = !options.isIdle
  const pips = DIE_PIP_LAYOUTS[options.value] ?? []
  for (let index = 0; index < 6; index += 1) {
    const pipGraphic = getOrCreateGraphicsChild(
      pipsLayer,
      `${DICE_PIP_NAME_PREFIX}-${index}`,
    )
    const pip = pips[index]
    pipGraphic.visible = Boolean(pip) && !options.isIdle
    pipGraphic.clear()
    if (!pip || options.isIdle) {
      continue
    }

    pipGraphic
      .circle(pip.x * faceSize, pip.y * faceSize, pipRadius)
      .fill({ color: options.color, alpha: 0.98 })
  }
}

// 获取/创建动态层下的三个叠加层：基地块 / 效果 / 骰子（层级顺序固定）
function getOverlayLayers(scene: PIXI.Container) {
  const dynamicLayer = getOrCreateSceneLayer(scene, DYNAMIC_LAYER_NAME)
  const overlayLayer = getOrCreateSceneLayer(
    dynamicLayer,
    DYNAMIC_OVERLAY_LAYER_NAME,
  )
  const overlayBasesLayer = getOrCreateSceneLayer(
    overlayLayer,
    OVERLAY_BASES_LAYER_NAME,
  )
  const overlayEffectsLayer = getOrCreateSceneLayer(
    overlayLayer,
    OVERLAY_EFFECTS_LAYER_NAME,
  )
  const overlayDiceLayer = getOrCreateSceneLayer(
    overlayLayer,
    OVERLAY_DICE_LAYER_NAME,
  )

  overlayLayer.setChildIndex(overlayBasesLayer, 0)
  overlayLayer.setChildIndex(overlayEffectsLayer, 1)
  overlayLayer.setChildIndex(overlayDiceLayer, 2)

  return {
    dynamicLayer,
    overlayLayer,
    overlayBasesLayer,
    overlayEffectsLayer,
    overlayDiceLayer,
  }
}

// 同步棋盘中央的骰子：中心点、可摇骰判定、涟漪、点数面、阴影与各类缩放/旋转动画叠加
function syncDiceOverlay(options: DiceSceneOptions) {
  const { overlayDiceLayer } = getOverlayLayers(options.scene)
  const { width, height } = options.app.screen
  const boardSize = Math.min(width, height) - 20
  const safeBoardSize = Math.max(240, boardSize)
  const centerX = (width - safeBoardSize) / 2 + safeBoardSize / 2
  const centerY = (height - safeBoardSize) / 2 + safeBoardSize / 2

  const hideHandoffDice =
    (options.turn.diceHandoffHiding || options.turn.isTurnTransitioning) &&
    !options.dice.isRolling &&
    options.game.dice === 0

  const center = getOrCreateSceneLayer(overlayDiceLayer, DICE_CENTER_NAME)
  center.position.set(centerX, centerY)
  center.eventMode = 'passive'
  center.cursor = 'default'
  center.visible = !hideHandoffDice
  if (hideHandoffDice) {
    return
  }

  const canRoll =
    options.game.winnerIndex === -1 &&
    options.game.dice === 0 &&
    !options.turn.isTurnTransitioning &&
    options.move.movingPoint === null &&
    (options.turn.isHumanTurn() || !options.autoPlayMode)

  const diceSize = safeBoardSize * 0.18
  const currentPlayer = options.game.players[options.game.currentPlayerIndex]
  const currentPlayerColor = hexToNumber(currentPlayer.color)
  const diceValue = options.dice.getDiceDisplayValue()
  const isIdleDiceState = !options.dice.isRolling && options.game.dice === 0

  const diceGroup = getOrCreateSceneLayer(center, DICE_GROUP_NAME)
  diceGroup.eventMode = canRoll ? 'static' : 'passive'
  diceGroup.cursor = canRoll ? 'pointer' : 'default'
  if (diceGroup.hitArea instanceof PIXI.Rectangle) {
    diceGroup.hitArea.x = -diceSize * 0.95
    diceGroup.hitArea.y = -diceSize * 0.95
    diceGroup.hitArea.width = diceSize * 1.9
    diceGroup.hitArea.height = diceSize * 1.9
  } else {
    diceGroup.hitArea = new PIXI.Rectangle(
      -diceSize * 0.95,
      -diceSize * 0.95,
      diceSize * 1.9,
      diceSize * 1.9,
    )
  }
  diceGroup.removeAllListeners()
  if (canRoll) {
    diceGroup.on('pointerdown', () => options.onRoll(false))
  }

  const idleRippleLayer = getOrCreateGraphicsChild(
    center,
    DICE_IDLE_RIPPLE_NAME,
    0,
  )
  idleRippleLayer.eventMode = 'none'
  idleRippleLayer.visible = canRoll
  idleRippleLayer.clear()
  if (canRoll) {
    const rippleBaseRadius = diceSize * 0.52
    const rippleSpan = diceSize * 0.62
    for (const ring of getRippleRings(options.dice.idleRipple)) {
      idleRippleLayer
        .circle(0, 0, rippleBaseRadius + ring.progress * rippleSpan)
        .stroke({
          color: currentPlayerColor,
          width: 2.5,
          alpha: ring.alpha * 0.38,
        })
    }
  }

  const faceSize = diceSize * 0.72
  const fittedHeight = diceSize * 0.98
  const fittedWidth = diceSize * 0.92
  const diceShadow = getOrCreateGraphicsChild(diceGroup, DICE_SHADOW_NAME, 0)
  diceShadow.clear()
  diceShadow
    .ellipse(
      0,
      fittedHeight * (0.36 + options.dice.diceLandingSquash * 0.08),
      fittedWidth *
        0.24 *
        (1 +
          options.dice.diceLandingSquash * 0.45 +
          (options.dice.isRolling ? 0.06 : 0)),
      fittedHeight * 0.08 * (1 + options.dice.diceLandingSquash * 0.35),
    )
    .fill({
      color: 0x020617,
      alpha:
        0.16 +
        (options.dice.isRolling ? 0.08 : 0.02) +
        options.dice.diceLandingSquash * 0.14,
    })

  const diceFace = getOrCreateSceneLayer(diceGroup, DICE_FACE_NAME)
  syncDiceFaceGraphic(diceFace, {
    size: diceSize,
    color: currentPlayerColor,
    value: Math.min(6, Math.max(1, diceValue || 1)),
    isIdle: isIdleDiceState,
    idlePulse: options.dice.diceIdlePulse,
    isRolling: options.dice.isRolling,
    diceLandingSquash: options.dice.diceLandingSquash,
  })

  const promptGlow = getOrCreateGraphicsChild(diceGroup, DICE_PROMPT_GLOW_NAME)
  promptGlow.visible = !options.dice.isRolling && isIdleDiceState
  promptGlow.clear()
  if (promptGlow.visible) {
    promptGlow
      .roundRect(
        -faceSize * 0.18,
        faceSize * 0.09,
        faceSize * 0.36,
        faceSize * 0.2,
        faceSize * 0.08,
      )
      .fill({
        color: 0xffffff,
        alpha: 0.14 + options.dice.diceIdlePulse * 0.08,
      })
  }

  const settleFlashAlpha =
    !options.dice.isRolling && !isIdleDiceState
      ? Math.max(
          0,
          Math.min(
            0.18,
            options.dice.diceLandingSquash * 0.32 +
              options.dice.diceLandingLift * 0.004,
          ),
        )
      : 0
  const settleFlash = getOrCreateGraphicsChild(
    diceGroup,
    DICE_SETTLE_FLASH_NAME,
  )
  settleFlash.visible = settleFlashAlpha > 0.001
  settleFlash.clear()
  if (settleFlash.visible) {
    settleFlash
      .roundRect(
        -fittedWidth * 0.33,
        -fittedHeight * 0.33,
        fittedWidth * 0.66,
        fittedHeight * 0.24,
        fittedWidth * 0.08,
      )
      .fill({ color: 0xffffff, alpha: settleFlashAlpha })
  }

  const diceScaleBoost =
    1 + options.dice.diceIdlePulse * 0.05 + (options.dice.isRolling ? 0.05 : 0)
  const landingScaleX =
    1 +
    options.dice.diceLandingSquash * 0.34 +
    options.dice.diceResultPop * 0.08
  const landingScaleY =
    1 -
    options.dice.diceLandingSquash * 0.24 +
    options.dice.diceResultPop * 0.04
  const landingSettleNudge =
    !options.dice.isRolling && !isIdleDiceState
      ? Math.max(0, options.dice.diceLandingSquash * 0.1)
      : 0
  const spinScaleX =
    options.dice.diceSpinScale *
    diceScaleBoost *
    (options.dice.isRolling ? options.dice.diceSpinFlip : 1) *
    landingScaleX
  const spinScaleY =
    options.dice.diceSpinScale *
    diceScaleBoost *
    (options.dice.isRolling ? 1 + (1 - options.dice.diceSpinFlip) * 0.22 : 1) *
    landingScaleY
  diceGroup.position.set(
    0,
    -options.dice.diceLandingLift + landingSettleNudge * fittedHeight * 0.08,
  )
  diceGroup.rotation = options.dice.diceSpinRotation
  diceGroup.scale.set(spinScaleX, spinScaleY)
}

export function syncDiceOnly(options: DiceSceneOptions) {
  syncDiceOverlay(options)
}

// 把规则层棋子位置（progress）解析为棋盘像素坐标：
// base → 停机坪槽位；track → 跑道格中心；home/finished → 终点跑道槽位
export function resolvePiecePoint(
  layout: BoardLayout,
  boardPreset: BoardPreset,
  player: Pick<PlayerState, 'index' | 'startIndex' | 'boardPresetId'>,
  piece: Pick<PieceState, 'progress'>,
) {
  const homeEntryStep = boardPreset.trackLength + 1
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps

  const centerX = layout.trackPoints[0]?.x ?? 0
  const centerY = layout.trackPoints[0]?.y ?? 0

  if (piece.progress <= 0) {
    return layout.baseSlots[player.index]?.[0] ?? { x: centerX, y: centerY }
  }

  if (piece.progress <= boardPreset.trackLength) {
    const trackIndex = getTrackCellIndex(player, piece)
    if (trackIndex !== -1) {
      return layout.trackPoints[trackIndex] ?? { x: centerX, y: centerY }
    }
    return { x: centerX, y: centerY }
  }

  if (piece.progress < finishStep) {
    const laneIndex = piece.progress - homeEntryStep
    return (
      layout.finishSlots[player.index]?.[laneIndex] ?? {
        x: centerX,
        y: centerY,
      }
    )
  }

  return (
    layout.finishSlots[player.index]?.[boardPreset.homeSteps - 1] ?? {
      x: centerX,
      y: centerY,
    }
  )
}

export function getPlayerByPieceId(state: GameState, pieceId: string) {
  return (
    state.players.find((player) =>
      player.pieces.some((piece) => piece.id === pieceId),
    ) ?? null
  )
}

// 堆叠偏移模式：同格多颗棋子时按预设模式错开排布（最多 13 颗）
export function getStackOffsets(count: number, step: number) {
  const patterns = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ] as const

  return Array.from({ length: count }, (_, index) => {
    const pattern = patterns[index] ?? {
      x: (index % 5) - 2,
      y: Math.floor(index / 5) - 1,
    }

    return {
      x: pattern.x * step,
      y: pattern.y * step,
    }
  })
}

// 同格堆叠时整体缩小，避免多颗棋子互相遮挡
export function getStackScale(stackSize: number) {
  if (stackSize <= 1) {
    return 1
  }

  return Math.max(0.52, 1 - (stackSize - 1) * 0.14)
}

function getPaddedPointBounds(points: Point[], padding: number) {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

function getRoundedRectBorderPoint(
  rect: { x: number; y: number; width: number; height: number },
  cornerRadius: number,
  target: Point,
) {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const dx = target.x - centerX
  const dy = target.y - centerY
  const distance = Math.hypot(dx, dy)

  if (distance === 0) {
    return { x: centerX, y: centerY }
  }

  const directionX = dx / distance
  const directionY = dy / distance
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height

  const candidates: Array<{ x: number; y: number; t: number }> = []

  if (directionX !== 0) {
    const tLeft = (left - centerX) / directionX
    const yLeft = centerY + tLeft * directionY
    if (tLeft > 0 && yLeft >= top && yLeft <= bottom) {
      candidates.push({ x: left, y: yLeft, t: tLeft })
    }

    const tRight = (right - centerX) / directionX
    const yRight = centerY + tRight * directionY
    if (tRight > 0 && yRight >= top && yRight <= bottom) {
      candidates.push({ x: right, y: yRight, t: tRight })
    }
  }

  if (directionY !== 0) {
    const tTop = (top - centerY) / directionY
    const xTop = centerX + tTop * directionX
    if (tTop > 0 && xTop >= left && xTop <= right) {
      candidates.push({ x: xTop, y: top, t: tTop })
    }

    const tBottom = (bottom - centerY) / directionY
    const xBottom = centerX + tBottom * directionX
    if (tBottom > 0 && xBottom >= left && xBottom <= right) {
      candidates.push({ x: xBottom, y: bottom, t: tBottom })
    }
  }

  if (candidates.length === 0) {
    return { x: centerX, y: centerY }
  }

  const nearest = candidates.reduce((best, candidate) =>
    candidate.t < best.t ? candidate : best,
  )

  let edgePoint = { x: nearest.x, y: nearest.y }

  if (cornerRadius > 0) {
    const isTopOrBottom = edgePoint.y === top || edgePoint.y === bottom
    const isLeftOrRight = edgePoint.x === left || edgePoint.x === right

    if (isTopOrBottom && edgePoint.x < left + cornerRadius) {
      const cornerCenter = {
        x: left + cornerRadius,
        y: edgePoint.y === top ? top + cornerRadius : bottom - cornerRadius,
      }
      const angle = Math.atan2(
        target.y - cornerCenter.y,
        target.x - cornerCenter.x,
      )
      edgePoint = {
        x: cornerCenter.x + Math.cos(angle) * cornerRadius,
        y: cornerCenter.y + Math.sin(angle) * cornerRadius,
      }
    } else if (isTopOrBottom && edgePoint.x > right - cornerRadius) {
      const cornerCenter = {
        x: right - cornerRadius,
        y: edgePoint.y === top ? top + cornerRadius : bottom - cornerRadius,
      }
      const angle = Math.atan2(
        target.y - cornerCenter.y,
        target.x - cornerCenter.x,
      )
      edgePoint = {
        x: cornerCenter.x + Math.cos(angle) * cornerRadius,
        y: cornerCenter.y + Math.sin(angle) * cornerRadius,
      }
    } else if (isLeftOrRight && edgePoint.y < top + cornerRadius) {
      const cornerCenter = {
        x: edgePoint.x === left ? left + cornerRadius : right - cornerRadius,
        y: top + cornerRadius,
      }
      const angle = Math.atan2(
        target.y - cornerCenter.y,
        target.x - cornerCenter.x,
      )
      edgePoint = {
        x: cornerCenter.x + Math.cos(angle) * cornerRadius,
        y: cornerCenter.y + Math.sin(angle) * cornerRadius,
      }
    } else if (isLeftOrRight && edgePoint.y > bottom - cornerRadius) {
      const cornerCenter = {
        x: edgePoint.x === left ? left + cornerRadius : right - cornerRadius,
        y: bottom - cornerRadius,
      }
      const angle = Math.atan2(
        target.y - cornerCenter.y,
        target.x - cornerCenter.x,
      )
      edgePoint = {
        x: cornerCenter.x + Math.cos(angle) * cornerRadius,
        y: cornerCenter.y + Math.sin(angle) * cornerRadius,
      }
    }
  }

  return edgePoint
}

function drawDottedPolyline(
  graphics: PIXI.Graphics,
  points: Point[],
  options: {
    color: number
    alpha: number
    dotRadius: number
    dotSpacing: number
    closed?: boolean
  },
) {
  if (points.length === 0) return

  const drawDot = (x: number, y: number) => {
    graphics.circle(x, y, options.dotRadius).fill({
      color: options.color,
      alpha: options.alpha,
    })
  }

  // drawDot(points[0].x, points[0].y)

  const segmentCount = options.closed ? points.length : points.length - 1
  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.floor(distance / options.dotSpacing))

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      drawDot(from.x + dx * t, from.y + dy * t)
    }
  }
}

// 取某玩家所在边的中点（用于绘制停机坪→终点跑道的连接虚线）
function getOuterBorderMidPoint(layout: BoardLayout, playerIndex: number) {
  const borderSides = [
    layout.leftBorderPoints,
    layout.topBorderPoints,
    layout.rightBorderPoints,
    layout.bottomBorderPoints,
  ]
  const points = borderSides[playerIndex]
  return points[Math.floor((points.length - 1) / 2)]
}

// —— 场景分层：静态层(棋盘，重建代价高) / 动态层(棋子骰子效果，每次同步) ——
const STATIC_LAYER_NAME = 'flight-ludo-static-layer'
const DYNAMIC_LAYER_NAME = 'flight-ludo-dynamic-layer'
const DYNAMIC_OVERLAY_LAYER_NAME = 'flight-ludo-dynamic-overlay-layer'
const DYNAMIC_PIECES_LAYER_NAME = 'flight-ludo-dynamic-pieces-layer'
const PIECE_GLOW_NAME = 'flight-ludo-piece-glow'
const PIECE_BODY_NAME = 'flight-ludo-piece-body'

// 跨帧缓存：场景 → 静态棋盘 key + 棋子组（避免每帧重建棋子节点）
type SceneRenderState = {
  staticBoardKey: string
  pieceGroups: Map<string, PIXI.Container>
}

const sceneRenderStates = new WeakMap<PIXI.Container, SceneRenderState>()

function clearContainer(container: PIXI.Container) {
  const removable = container.removeChildren()
  for (const child of removable) {
    child.destroy({ children: true })
  }
}

function getSceneRenderState(scene: PIXI.Container) {
  let state = sceneRenderStates.get(scene)
  if (!state) {
    state = {
      staticBoardKey: '',
      pieceGroups: new Map<string, PIXI.Container>(),
    }
    sceneRenderStates.set(scene, state)
  }

  return state
}

// 按 label 查找子节点
function findNamedChild(container: PIXI.Container, name: string) {
  return container.children.find((child) => child.label === name) ?? null
}

// 获取或创建命名层（PIXI.Container）
function getOrCreateSceneLayer(scene: PIXI.Container, name: string) {
  const existing = findNamedChild(scene, name)
  if (existing instanceof PIXI.Container) {
    return existing
  }

  const layer = new PIXI.Container()
  layer.label = name
  scene.addChild(layer)
  return layer
}

function syncPieceGlow(options: {
  pieceGroup: PIXI.Container
  isVisible: boolean
  pieceRadius: number
  color: string
  legalPulse: number
}) {
  const existingGlow = findNamedChild(options.pieceGroup, PIECE_GLOW_NAME)
  let glow: PIXI.Graphics
  if (existingGlow instanceof PIXI.Graphics) {
    glow = existingGlow
  } else {
    if (existingGlow) {
      options.pieceGroup.removeChild(existingGlow)
    }
    glow = new PIXI.Graphics()
    glow.label = PIECE_GLOW_NAME
    options.pieceGroup.addChildAt(glow, 0)
  }

  if (!options.isVisible) {
    glow.visible = false
    glow.clear()
    return
  }

  glow.visible = true
  glow.clear()
  glow.circle(0, 0, options.pieceRadius + 6).stroke({
    color: hexToNumber(options.color),
    width: 2,
    alpha: 0.12 + options.legalPulse * 0.16,
  })
}

// 同步棋子身体：优先用玩家贴图（Sprite），无贴图时降级为纯色圆 + 白描边
function syncPieceBody(options: {
  pieceGroup: PIXI.Container
  texture: PIXI.Texture | null
  tint: number
  pieceRadius: number
  pieceBodyScale: number
  isBasePiece: boolean
}) {
  const existingBody = findNamedChild(options.pieceGroup, PIECE_BODY_NAME)

  if (options.texture) {
    let body: PIXI.Sprite
    if (existingBody instanceof PIXI.Sprite) {
      body = existingBody
    } else {
      if (existingBody) {
        options.pieceGroup.removeChild(existingBody)
        existingBody.destroy({ children: true })
      }
      body = new PIXI.Sprite(options.texture)
      body.label = PIECE_BODY_NAME
      options.pieceGroup.addChild(body)
    }

    body.texture = options.texture
    body.anchor.set(0.5)
    body.position.set(0, options.isBasePiece ? -3 : -1.5)
    body.width = options.pieceRadius * options.pieceBodyScale
    body.height = options.pieceRadius * options.pieceBodyScale
    body.tint = 0xffffff
    return
  }

  let body: PIXI.Graphics
  if (existingBody instanceof PIXI.Graphics) {
    body = existingBody
  } else {
    if (existingBody) {
      options.pieceGroup.removeChild(existingBody)
      existingBody.destroy({ children: true })
    }
    body = new PIXI.Graphics()
    body.label = PIECE_BODY_NAME
    options.pieceGroup.addChild(body)
  }

  body.clear()
  body
    .circle(0, 0, options.pieceRadius + 5)
    .fill({ color: options.tint, alpha: 1 })
    .stroke({ color: 0xffffff, width: 2, alpha: 0.88 })
}

// 移除本帧不再存在的棋子组（如棋子数减少），避免节点泄漏
function removeStalePieceGroups(
  piecesLayer: PIXI.Container,
  sceneState: SceneRenderState,
  activePieceIds: Set<string>,
) {
  for (const [pieceId, pieceGroup] of Array.from(
    sceneState.pieceGroups.entries(),
  )) {
    if (activePieceIds.has(pieceId)) continue
    if (pieceGroup.parent === piecesLayer) {
      piecesLayer.removeChild(pieceGroup)
    }
    pieceGroup.destroy({ children: true })
    sceneState.pieceGroups.delete(pieceId)
  }
}

// 静态棋盘缓存 key：任一相关配置变化才重建静态层，其余帧直接复用
function buildStaticBoardKey(options: {
  width: number
  height: number
  safeBoardSize: number
  boardPresetId: string
  boardPreset: BoardPreset
  boardRenderLayout: BoardRenderLayout
  game: GameState
}) {
  const playerSignature = options.game.players
    .map((player) => `${player.index}:${player.color}:${player.startIndex}`)
    .join('|')

  return [
    options.width,
    options.height,
    options.safeBoardSize,
    options.boardPresetId,
    options.boardPreset.trackLength,
    options.boardPreset.stepsPerEdge,
    options.boardPreset.homeSteps,
    options.boardRenderLayout.trackInsetRatio,
    options.boardRenderLayout.baseZonePaddingRatio,
    options.boardRenderLayout.finishGapRatio,
    options.boardRenderLayout.finishBoxSizeRatio,
    playerSignature,
  ].join(':')
}

/**
 * 全量渲染入口（每次游戏状态/动画状态变化时调用）。
 *
 * 结构：
 *  1. 静态层：棋盘格、四边虚线、终点跑道格、基地→起点连线、停机坪→终点连接线
 *     （仅当 buildStaticBoardKey 变化时重建）
 *  2. 叠加层：基地高亮（可摇骰提示）、中央骰子、胜利横幅、落点圈
 *  3. 棋子层：计算所有棋子像素位置与堆叠、绑定点击、同步贴图/发光
 *
 * 返回当前布局（供调用方缓存）。
 */
export function renderPlayScene(options: RenderPlaySceneOptions) {
  const staticLayer = getOrCreateSceneLayer(options.scene, STATIC_LAYER_NAME)
  const dynamicLayer = getOrCreateSceneLayer(options.scene, DYNAMIC_LAYER_NAME)
  for (const child of options.scene.children.slice()) {
    if (child !== staticLayer && child !== dynamicLayer) {
      options.scene.removeChild(child)
      child.destroy({ children: true })
    }
  }
  options.scene.setChildIndex(staticLayer, 0)
  options.scene.setChildIndex(dynamicLayer, 1)

  const { width, height } = options.app.screen
  const boardSize = Math.min(width, height) - 20
  const safeBoardSize = Math.max(240, boardSize)
  const originX = (width - safeBoardSize) / 2
  const originY = (height - safeBoardSize) / 2
  const cellSize = safeBoardSize * 0.06
  const trackSize = cellSize * 0.68
  const pieceRadius = cellSize * 0.28
  const trackPieceBodyScale = 7.2
  const basePieceBodyScale = 8.15
  const basePlaneBoundsPadding = Math.max(
    pieceRadius + 7,
    (pieceRadius * basePieceBodyScale) / 2 + 3,
  )

  const layout = options.layout
  const { trackPoints, baseSlots, finishSlots } = layout

  const sceneState = getSceneRenderState(options.scene)
  const staticBoardKey = buildStaticBoardKey({
    width,
    height,
    safeBoardSize,
    boardPresetId: options.game.boardPresetId,
    boardPreset: options.boardPreset,
    boardRenderLayout: options.boardRenderLayout,
    game: options.game,
  })

  if (sceneState.staticBoardKey !== staticBoardKey) {
    clearContainer(staticLayer)

    // Draw the raw track cells first. These cells are the actual movement path.
    for (let index = 0; index < trackPoints.length; index += 1) {
      const point = trackPoints[index]
      const cell = new PIXI.Graphics()
      const playerIndex =
        Math.floor(index / options.boardPreset.stepsPerEdge) %
        options.game.players.length
      const activeColor = options.game.players[playerIndex].color
      const isStartCell = index % options.boardPreset.stepsPerEdge === 0
      const isSafeTrackCell = isSafeCell(
        playerIndex,
        index,
        options.game.boardPresetId,
      )
      cell
        .roundRect(
          point.x - trackSize / 2,
          point.y - trackSize / 2,
          trackSize,
          trackSize,
          90, // fully rounded to make circles
        )
        .fill({
          color: isSafeTrackCell ? 0xf8fafc : 0xe2e8f0,
          alpha: isSafeTrackCell ? 0.6 : 0.5,
        })
        .stroke({
          color: activeColor,
          width: isStartCell ? 3 : isSafeTrackCell ? 2 : 1,
          alpha: isSafeTrackCell ? 0.55 : 0.35,
        })
      staticLayer.addChild(cell)
    }

    const outerBorderDotRadius = Math.max(4, trackSize * 0.08)
    const outerBorderDotSpacing = Math.max(12, trackSize * 0.9)

    // Draw dotted borders around the board edges, colored by player
    const topBorder = new PIXI.Graphics()
    drawDottedPolyline(topBorder, layout.topBorderPoints, {
      color: hexToNumber(options.game.players[0].color),
      alpha: 0.25,
      dotRadius: outerBorderDotRadius,
      dotSpacing: outerBorderDotSpacing,
    })
    staticLayer.addChild(topBorder)

    const rightBorder = new PIXI.Graphics()
    drawDottedPolyline(rightBorder, layout.rightBorderPoints, {
      color: hexToNumber(options.game.players[1].color),
      alpha: 0.5,
      dotRadius: outerBorderDotRadius,
      dotSpacing: outerBorderDotSpacing,
    })
    staticLayer.addChild(rightBorder)

    const bottomBorder = new PIXI.Graphics()
    drawDottedPolyline(bottomBorder, layout.bottomBorderPoints, {
      color: hexToNumber(options.game.players[2].color),
      alpha: 0.25,
      dotRadius: outerBorderDotRadius,
      dotSpacing: outerBorderDotSpacing,
    })
    staticLayer.addChild(bottomBorder)

    const leftBorder = new PIXI.Graphics()
    drawDottedPolyline(leftBorder, layout.leftBorderPoints, {
      color: hexToNumber(options.game.players[3].color),
      alpha: 0.25,
      dotRadius: outerBorderDotRadius,
      dotSpacing: outerBorderDotSpacing,
    })
    staticLayer.addChild(leftBorder)

    for (const player of options.game.players) {
      const finish = finishSlots[player.index]

      const finishBoxRadius =
        safeBoardSize * options.boardRenderLayout.finishBoxSizeRatio
      for (const [laneIndex, lanePoint] of finish.entries()) {
        const laneCell = new PIXI.Graphics()
        laneCell
          .roundRect(
            lanePoint.x - finishBoxRadius,
            lanePoint.y - finishBoxRadius,
            finishBoxRadius * 2,
            finishBoxRadius * 2,
            120,
          )
          .fill({
            color: player.color,
            alpha: laneIndex === finish.length - 1 ? 0.13 : 0.08,
          })
          .stroke({
            color: player.color,
            width: laneIndex === finish.length - 1 ? 2 : 1,
            alpha: laneIndex === finish.length - 1 ? 0.35 : 0.24,
          })
        staticLayer.addChild(laneCell)
      }

      // base point:
      // player 0 is  top left,
      // player 1 is top right,
      // player 2 is bottom right,
      // player 3 is bottom left
      const baseBounds = getPaddedPointBounds(
        baseSlots[player.index],
        2.5 * outerBorderDotSpacing,
      )
      const startPoint = options.layout.trackPoints[player.startIndex]
      const baseEdgePoint = getRoundedRectBorderPoint(
        baseBounds,
        14,
        startPoint,
      )

      // Draw dotted line from base roundRect edge to start point on track
      const baseToStartLine = new PIXI.Graphics()
      drawDottedPolyline(baseToStartLine, [baseEdgePoint, startPoint], {
        color: hexToNumber(player.color),
        alpha: 0.25,
        dotRadius: Math.max(2, trackSize * 0.08),
        dotSpacing: Math.max(12, trackSize * 0.9),
      })
      staticLayer.addChild(baseToStartLine)

      // Draw dotted lines from outer border midpoint to track home lane entry
      const homeConnector = new PIXI.Graphics()
      const outerMidPoint = getOuterBorderMidPoint(layout, player.index)
      const homeConnectorPoints = [outerMidPoint, ...finish]

      drawDottedPolyline(homeConnector, homeConnectorPoints, {
        color: hexToNumber(player.color),
        alpha: 0.25,
        dotRadius: Math.max(4, trackSize * 0.075),
        dotSpacing: outerBorderDotSpacing,
      })
      staticLayer.addChild(homeConnector)
    }

    sceneState.staticBoardKey = staticBoardKey
  }

  // —— 叠加层：基地高亮 + 中央骰子 + 胜利/落点效果 ——
  const {
    overlayLayer,
    overlayBasesLayer,
    overlayEffectsLayer,
    overlayDiceLayer,
  } = getOverlayLayers(options.scene)
  const piecesLayer = getOrCreateSceneLayer(
    dynamicLayer,
    DYNAMIC_PIECES_LAYER_NAME,
  )
  for (const child of dynamicLayer.children.slice()) {
    if (child !== overlayLayer && child !== piecesLayer) {
      dynamicLayer.removeChild(child)
      child.destroy({ children: true })
    }
  }
  dynamicLayer.setChildIndex(overlayLayer, 0)
  dynamicLayer.setChildIndex(piecesLayer, 1)
  for (const child of overlayLayer.children.slice()) {
    if (
      child !== overlayBasesLayer &&
      child !== overlayEffectsLayer &&
      child !== overlayDiceLayer
    ) {
      overlayLayer.removeChild(child)
      child.destroy({ children: true })
    }
  }
  clearContainer(overlayBasesLayer)
  clearContainer(overlayEffectsLayer)
  const baseBoard = overlayBasesLayer
  const effectsBoard = overlayEffectsLayer

  // 是否允许摇骰：未结束 / 未掷骰 / 非回合切换中 / 无移动动画 / （真人回合或关闭了托管）
  const canRoll =
    options.game.winnerIndex === -1 &&
    options.game.dice === 0 &&
    !options.turn.isTurnTransitioning &&
    options.move.movingPoint === null &&
    (options.turn.isHumanTurn() || !options.autoPlayMode)

  // 基地块：高亮当前玩家基地，可摇骰时整个基地可点击 + 呼吸光晕提示
  for (const player of options.game.players) {
    const playerBase = new PIXI.Graphics()
    const baseBounds = getPaddedPointBounds(
      baseSlots[player.index],
      basePlaneBoundsPadding,
    )

    const isActivePlayer = options.game.currentPlayerIndex === player.index
    playerBase
      .roundRect(
        baseBounds.x,
        baseBounds.y,
        baseBounds.width,
        baseBounds.height,
        14,
      )
      .fill({ color: player.color, alpha: isActivePlayer ? 0.1 : 0.07 })
      .stroke({
        color: player.color,
        width: isActivePlayer ? 3 : 2,
        alpha: isActivePlayer ? 0.3 : 0.2,
      })
    baseBoard.addChild(playerBase)

    if (isActivePlayer && canRoll) {
      playerBase.eventMode = 'static'
      playerBase.cursor = 'pointer'
      playerBase.hitArea = new PIXI.Rectangle(
        baseBounds.x,
        baseBounds.y,
        baseBounds.width,
        baseBounds.height,
      )
      playerBase.on('pointerdown', () => options.onRoll(false))
    }

    if (isActivePlayer && canRoll) {
      const breath = 0.5 + 0.5 * Math.sin(options.dice.idleRipple * Math.PI * 2)
      const playerColor = hexToNumber(player.color)

      const outerGlow = new PIXI.Graphics()
      outerGlow.eventMode = 'none'
      outerGlow
        .roundRect(
          baseBounds.x - 6,
          baseBounds.y - 6,
          baseBounds.width + 12,
          baseBounds.height + 12,
          18,
        )
        .stroke({
          color: playerColor,
          width: 5,
          alpha: 0.05 + breath * 0.08,
        })
      baseBoard.addChild(outerGlow)

      const baseGlow = new PIXI.Graphics()
      baseGlow.eventMode = 'none'
      baseGlow
        .roundRect(
          baseBounds.x,
          baseBounds.y,
          baseBounds.width,
          baseBounds.height,
          14,
        )
        .stroke({
          color: playerColor,
          width: 3,
          alpha: 0.15 + breath * 0.28,
        })
      baseBoard.addChild(baseGlow)
    }
  }

  syncDiceOverlay(options)

  // 胜利横幅与落点脉冲圈（效果层）
  if (options.winner) {
    const banner = new PIXI.Graphics()
      .roundRect(
        originX + safeBoardSize * 0.18,
        originY + safeBoardSize * 0.36,
        safeBoardSize * 0.64,
        safeBoardSize * 0.16,
        24,
      )
      .fill({ color: 0x020617, alpha: 0.9 })
      .stroke({ color: options.winner.color, width: 3, alpha: 0.9 })
    effectsBoard.addChild(banner)
  }

  if (options.move.landingPoint) {
    const pulse = new PIXI.Graphics()
      .circle(
        options.move.landingPoint.x,
        options.move.landingPoint.y,
        pieceRadius * 1.25,
      )
      .stroke({
        color: hexToNumber(options.move.landingPoint.color),
        width: 3,
        alpha: 0.35,
      })
    effectsBoard.addChild(pulse)
  }

  // —— 棋子渲染 ——
  // 先把每个棋子的规则位置换算为像素坐标（base/track/home/finished 四种位置）
  const pieces: PieceRenderInfo[] = options.game.players.flatMap((player) =>
    player.pieces.map((piece, pieceIndex) => {
      const location = getPieceLocation(player, piece)
      let x = originX + safeBoardSize / 2
      let y = originY + safeBoardSize / 2

      if (location === 'base') {
        const slot =
          baseSlots[player.index][pieceIndex] ?? baseSlots[player.index][0]
        x = slot.x
        y = slot.y
      } else if (location === 'track') {
        const trackIndex = getTrackCellIndex(player, piece)
        if (trackIndex !== -1) {
          const point = trackPoints[trackIndex]
          x = point.x
          y = point.y
        }
      } else if (location === 'home') {
        const laneIndex = getHomeLaneIndex(piece, player.boardPresetId)
        const slot =
          finishSlots[player.index][laneIndex] ?? finishSlots[player.index][0]
        x = slot.x
        y = slot.y
      } else {
        const slot =
          finishSlots[player.index][options.boardPreset.homeSteps - 1] ??
          finishSlots[player.index][0]
        x = slot.x
        y = slot.y
      }

      // 落点脉冲圈附近的棋子轻微推开，让落点效果可见
      if (
        options.move.landingPoint &&
        options.move.landingPoint.color === player.color &&
        piece.progress >= 0
      ) {
        const dx = x - options.move.landingPoint.x
        const dy = y - options.move.landingPoint.y
        if (Math.hypot(dx, dy) < pieceRadius * 4) {
          x += dx * 0.08
          y += dy * 0.08
        }
      }

      // 被吃飞行动画期间用动画坐标覆盖静态坐标
      const capturedFlight = options.move.capturedFlights.find(
        (flight) => flight.pieceId === piece.id,
      )
      if (capturedFlight) {
        const capturedState = getCapturedFlightRenderState(
          capturedFlight,
          performance.now(),
        )
        x = capturedState.position.x
        y = capturedState.position.y
      }

      return { player, piece, pieceIndex, x, y, location, capturedFlight }
    }),
  )

  // 同格堆叠：按像素坐标分桶，同桶的棋子错位排开并整体缩小
  const stackStep = Math.max(
    2,
    Math.round(
      pieceRadius * Math.min(trackPieceBodyScale, basePieceBodyScale) * 0.12,
    ),
  )
  const stackGroups = new Map<string, number[]>()
  const getStackKey = (pieceInfo: (typeof pieces)[number]) =>
    [pieceInfo.location, pieceInfo.x.toFixed(2), pieceInfo.y.toFixed(2)].join(
      '|',
    )

  pieces.forEach((pieceInfo, index) => {
    const key = getStackKey(pieceInfo)
    const bucket = stackGroups.get(key)
    if (bucket) {
      bucket.push(index)
    } else {
      stackGroups.set(key, [index])
    }
  })

  const stackIndexByPiece = new Map<number, number>()
  const stackSizeByPiece = new Map<number, number>()
  for (const indices of stackGroups.values()) {
    indices.forEach((pieceIndex, stackIndex) => {
      stackIndexByPiece.set(pieceIndex, stackIndex)
      stackSizeByPiece.set(pieceIndex, indices.length)
    })
  }

  const activePieceIds = new Set<string>()

  // 逐个同步棋子组：位置/缩放/点击/发光/身体/被吃旋转透明度；复用缓存的 pieceGroup
  for (const [index, pieceInfo] of pieces.entries()) {
    activePieceIds.add(pieceInfo.piece.id)
    const isLegal =
      options.game.winnerIndex === -1 &&
      options.legalPieces.includes(pieceInfo.piece.id)
    const isMoving =
      options.move.replayingPieceId === pieceInfo.piece.id &&
      options.move.movingPoint !== null
    const isCaptured = Boolean(pieceInfo.capturedFlight)
    const movingPosition = options.move.movingPoint
    const capturedRenderState = pieceInfo.capturedFlight
      ? getCapturedFlightRenderState(
          pieceInfo.capturedFlight,
          performance.now(),
        )
      : null
    const stackIndex = stackIndexByPiece.get(index) ?? 0
    const stackSize = stackSizeByPiece.get(index) ?? 1
    const stackScale = getStackScale(stackSize)
    const stackOffsets =
      stackSize > 1 ? getStackOffsets(stackSize, stackStep) : [{ x: 0, y: 0 }]
    const stackOffset = stackOffsets[stackIndex] ?? { x: 0, y: 0 }
    let pieceGroup = sceneState.pieceGroups.get(pieceInfo.piece.id)
    if (!pieceGroup) {
      pieceGroup = new PIXI.Container()
      pieceGroup.label = `flight-ludo-piece-${pieceInfo.piece.id}`
      sceneState.pieceGroups.set(pieceInfo.piece.id, pieceGroup)
      piecesLayer.addChild(pieceGroup)
    } else if (pieceGroup.parent !== piecesLayer) {
      piecesLayer.addChild(pieceGroup)
    }

    pieceGroup.position.set(
      (isMoving && movingPosition ? movingPosition.x : pieceInfo.x) +
        stackOffset.x,
      (isMoving && movingPosition ? movingPosition.y : pieceInfo.y) +
        stackOffset.y,
    )
    pieceGroup.scale.set(stackScale)
    pieceGroup.eventMode =
      isLegal && !isMoving && !isCaptured ? 'static' : 'passive'
    pieceGroup.cursor =
      isLegal && !isMoving && !isCaptured ? 'pointer' : 'default'
    pieceGroup.removeAllListeners()

    if (isLegal && !isMoving) {
      pieceGroup.on('pointerdown', () => options.onMove(pieceInfo.piece.id))
    }

    syncPieceGlow({
      pieceGroup,
      isVisible: isLegal && !isMoving,
      pieceRadius,
      color: pieceInfo.player.color,
      legalPulse: options.turn.legalPulse,
    })

    const tint = hexToNumber(pieceInfo.player.color)
    const texture = options.getPlayerPieceTexture(pieceInfo.player.index)
    const pieceBodyScale =
      pieceInfo.location === 'base' ? basePieceBodyScale : trackPieceBodyScale
    syncPieceBody({
      pieceGroup,
      texture,
      tint,
      pieceRadius,
      pieceBodyScale,
      isBasePiece: pieceInfo.location === 'base',
    })

    if (capturedRenderState) {
      pieceGroup.rotation = capturedRenderState.rotation
      pieceGroup.alpha = capturedRenderState.alpha
    } else {
      pieceGroup.rotation = 0
      pieceGroup.alpha = 1
    }

    if (piecesLayer.getChildIndex(pieceGroup) !== index) {
      piecesLayer.setChildIndex(pieceGroup, index)
    }
  }

  removeStalePieceGroups(piecesLayer, sceneState, activePieceIds)

  return layout
}
