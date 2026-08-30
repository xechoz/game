/**
 * 棋子移动控制器（moveController）
 *
 * 职责：
 *  - 响应棋子点击（handleMove）：先调规则层 movePiece 拿到结果，
 *    再按 buildMoveTrajectory 的轨迹逐格播放移动动画（含起跳弧线）
 *  - 被吃棋子"飞回停机坪"动画（capturedFlights）
 *  - 移动结束后的落点脉冲圈（landingPoint）
 *
 * 动画期间用 movingPoint 覆盖棋子在渲染层的位置，结束时恢复由 game 状态计算的位置。
 */
import { ref, type ComputedRef, type Ref } from 'vue'

import {
  buildMoveTrajectory,
  getCurrentPlayer,
  movePiece,
  type GameState,
  type PieceState,
  type PlayerState,
} from '../../game'
import type { BoardLayout, LandingPoint, Point, RefreshGameView } from './types'
import {
  createCapturedFlight,
  isCapturedFlightComplete,
} from './boardRenderer.FailAnim'
import type { CapturedFlightState } from './boardRenderer.FailAnim'

function easeInOutSine(progress: number) {
  return 0.5 - Math.cos(Math.PI * progress) / 2
}

function interpolatePoint(start: Point, end: Point, progress: number): Point {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  }
}

type MoveControllerOptions = {
  game: Ref<GameState>
  legalPieces: ComputedRef<string[]>
  diceHandoffHiding: Ref<boolean>
  getCurrentLayout: () => BoardLayout | null
  resolvePiecePoint: (
    layout: BoardLayout,
    player: Pick<PlayerState, 'index' | 'startIndex' | 'boardPresetId'>,
    piece: Pick<PieceState, 'progress'>,
  ) => Point
  clearTimers: () => void
  renderScene: () => void
  refreshGameView: RefreshGameView
  scheduleTurnAdvance: (delay?: number) => void
  playFailSound: () => void
  playMoveSound: () => void
  playWinSound: () => void
}

export function createMoveController(options: MoveControllerOptions) {
  // —— 移动动画状态（渲染层读取）——
  const replayingPieceId = ref<string>('') // 正在回放移动的棋子 id
  const movePath = ref<number[]>([]) // 规则层给出的轨迹（progress 序列）
  const replayingStartProgress = ref<number>(-1) // 移动前起点
  const movingPoint = ref<Point | null>(null) // 动画期间的实时坐标（覆盖静态位置）
  const landingPoint = ref<LandingPoint | null>(null) // 落点脉冲圈
  const capturedFlights = ref<CapturedFlightState[]>([]) // 被吃棋子的飞行动画

  let landingTimer: number = -1
  let moveFrameId: number = -1
  let captureFrameId: number = -1

  // 清理被吃飞行动画
  function clearCapturedFlights() {
    if (captureFrameId !== -1) {
      window.cancelAnimationFrame(captureFrameId)
      captureFrameId = -1
    }
    capturedFlights.value = []
  }

  function clearMovePreview() {
    replayingPieceId.value = ''
    movePath.value = []
    replayingStartProgress.value = -1
    movingPoint.value = null
    landingPoint.value = null
  }

  function clearMoveTimers() {
    if (landingTimer !== -1) {
      window.clearTimeout(landingTimer)
      landingTimer = -1
    }
    if (moveFrameId !== -1) {
      window.cancelAnimationFrame(moveFrameId)
      moveFrameId = -1
    }
    clearCapturedFlights()
  }

  // 逐帧播放被吃飞行动画，全部结束后刷新视图
  function scheduleCapturedFlightAnimation() {
    if (captureFrameId !== -1 || capturedFlights.value.length === 0) return

    const frame = (now: number) => {
      const activeFlights = capturedFlights.value.filter(
        (flight) => !isCapturedFlightComplete(flight, now),
      )
      if (activeFlights.length === 0) {
        clearCapturedFlights()
        options.refreshGameView()
        return
      }
      options.renderScene()
      captureFrameId = window.requestAnimationFrame(frame)
    }

    captureFrameId = window.requestAnimationFrame(frame)
  }

  function resetMoveState() {
    clearMoveTimers()
    clearMovePreview()
  }

  /**
   * 移动棋子（真人点击 / 托管自动均可调用）。
   * 流程：
   *  1. 校验（有布局 / 已掷骰 / 未结束 / 未在移动中 / 棋子合法）
   *  2. 移动前对全场棋子做位置快照（被吃后需要知道飞回哪个停机坪槽位）
   *  3. 调规则层 movePiece 落定状态
   *  4. 由结果构造被吃飞行动画、播放移动动画（按轨迹逐格 hop）
   *  5. 结束后播放音效、显示落点圈、按结果推进回合
   */
  function handleMove(pieceId: string) {
    const currentLayout = options.getCurrentLayout()
    if (
      !currentLayout ||
      options.game.value.dice === 0 ||
      options.game.value.winnerIndex !== -1 ||
      movingPoint.value !== null
    )
      return
    if (!options.legalPieces.value.includes(pieceId)) return

    const player = getCurrentPlayer(options.game.value)
    const piece = player.pieces.find((item) => item.id === pieceId)
    if (!piece) return

    const diceValue = options.game.value.dice
    const startProgress = piece.progress
    const trajectory = buildMoveTrajectory(player, piece, diceValue)
    if (trajectory.length === 0) return

    // 由轨迹构造动画路径点：起点 + 轨迹中每个 progress 对应的棋盘坐标
    const resolveProgress = (progress: number) =>
      options.resolvePiecePoint(currentLayout, player, { progress })
    const animPathPoints = [
      resolveProgress(startProgress),
      ...trajectory.map(resolveProgress),
    ]
    const endPoint =
      animPathPoints[animPathPoints.length - 1] ?? animPathPoints[0]

    // 移动前全场快照：被吃棋子需要飞回各自停机坪槽位，这里记录所有棋子的原始坐标/归属
    const snapshotByPieceId = new Map<
      string,
      { origin: Point; ownerIndex: number; pieceIndex: number; color: string }
    >()

    for (const candidatePlayer of options.game.value.players) {
      for (const candidatePiece of candidatePlayer.pieces) {
        const origin = options.resolvePiecePoint(
          currentLayout,
          candidatePlayer,
          candidatePiece,
        )
        const [, pieceIdIndex] = candidatePiece.id.split('-')
        snapshotByPieceId.set(candidatePiece.id, {
          origin,
          ownerIndex: candidatePlayer.index,
          pieceIndex: Number(pieceIdIndex),
          color: candidatePlayer.color,
        })
      }
    }

    options.clearTimers()
    replayingStartProgress.value = startProgress
    const result = movePiece(options.game.value, pieceId)
    if (!result.moved) {
      replayingStartProgress.value = -1
      clearMovePreview()
      options.refreshGameView()
      return
    }

    // 本次移动的吃子 → 生成"被吃棋子飞回停机坪"动画状态
    const capturedFlightsInMove = result.capturedPieceIds?.length
      ? result.capturedPieceIds
          .map((capturedId) => {
            const snapshot = snapshotByPieceId.get(capturedId)
            if (!snapshot) return null
            const destination =
              currentLayout.baseSlots[snapshot.ownerIndex]?.[
                snapshot.pieceIndex
              ] ??
              currentLayout.baseSlots[snapshot.ownerIndex]?.[0] ??
              snapshot.origin
            return createCapturedFlight(
              capturedId,
              snapshot.origin,
              destination,
              snapshot.color,
            )
          })
          .filter((value): value is CapturedFlightState => Boolean(value))
      : []

    if (capturedFlightsInMove.length > 0) {
      capturedFlights.value = capturedFlightsInMove
    }

    const willWin = result.victory
    if (result.advancePending) {
      options.diceHandoffHiding.value = true
    }
    replayingPieceId.value = pieceId
    movePath.value = trajectory
    movingPoint.value = { x: animPathPoints[0]!.x, y: animPathPoints[0]!.y }
    options.refreshGameView({ deferResultPage: willWin })

    // 动画参数：总步数越多每步越快；hopLift 控制每步起跳高度
    const pathPoints = animPathPoints
    const totalSteps = pathPoints.length - 1
    const hopLift = Math.max(10, Math.min(24, totalSteps * 2))
    const stepDuration = Math.max(
      200,
      Math.min(220, Math.round(420 / Math.max(1, totalSteps))),
    )
    const flightRatio = 0.55
    const flightDuration = stepDuration * flightRatio
    const totalDuration = stepDuration * totalSteps
    const startTime = performance.now()

    // 移动完成：复位动画状态、播放音效、显示落点圈、推进回合
    const finishMove = () => {
      moveFrameId = -1
      movingPoint.value = null
      options.playMoveSound()
      if (result.capturedCount > 0) options.playFailSound()
      if (result.victory) options.playWinSound()
      clearMovePreview()
      landingPoint.value = {
        x: endPoint.x,
        y: endPoint.y,
        color: player.color,
      }
      if (landingTimer !== -1) window.clearTimeout(landingTimer)
      landingTimer = window.setTimeout(() => {
        landingTimer = -1
        landingPoint.value = null
      }, 260)
      options.refreshGameView()
      if (capturedFlights.value.length > 0) {
        scheduleCapturedFlightAnimation()
      }
      if (result.advancePending) {
        options.diceHandoffHiding.value = false
        options.scheduleTurnAdvance(1200)
      }
    }

    // 逐帧动画：每个 stepDuration 内完成一段 起跳(flight)→落地 的 hop 插值
    const frame = (now: number) => {
      const elapsed = now - startTime

      if (totalSteps <= 0) {
        finishMove()
        return
      }

      // 定位当前处于第几步、步内进度；步前半段为飞行（抬升），后半段落地
      const clampedElapsed = Math.min(elapsed, totalDuration)
      const currentStep = Math.min(
        totalSteps - 1,
        Math.floor(clampedElapsed / stepDuration),
      )
      const stepElapsed = clampedElapsed - currentStep * stepDuration
      const isFlying = stepElapsed < flightDuration
      const stepProgress = isFlying ? stepElapsed / flightDuration : 1
      const easedProgress = easeInOutSine(stepProgress)
      const start = pathPoints[currentStep]
      const end = pathPoints[currentStep + 1] ?? start

      if (!start || !end) {
        finishMove()
        return
      }

      const currentPosition = interpolatePoint(start, end, easedProgress)
      const lift = isFlying ? Math.sin(stepProgress * Math.PI) * hopLift : 0

      movingPoint.value = {
        x: currentPosition.x,
        y: currentPosition.y - lift,
      }
      options.renderScene()

      if (elapsed < totalDuration) {
        moveFrameId = window.requestAnimationFrame(frame)
        return
      }

      finishMove()
    }

    moveFrameId = window.requestAnimationFrame(frame)
  }

  return {
    replayingPieceId,
    movePath,
    replayingStartProgress,
    movingPoint,
    landingPoint,
    capturedFlights,
    clearMovePreview,
    clearMoveTimers,
    resetMoveState,
    handleMove,
  }
}
