/**
 * 回合控制器（turnController）
 *
 * 职责：
 *  - 维护回合流转状态：isTurnTransitioning（回合切换中）、diceHandoffHiding（交接隐藏骰子）
 *  - 自动托管时间线：定时驱动 摇骰 → 选择棋子 → 移动 的完整流程（playAutoTurn）
 *  - 回合推进调度：移动/跳过后 delay 一段时间再 advanceTurn
 *  - 可走棋子的呼吸高亮动画（legalPulse）
 *
 * 只负责"编排时机"，具体摇骰/移动动作通过注入的 handleRoll / handleMove 委托出去。
 */
import { ref, type ComputedRef, type Ref } from 'vue'

import {
  advanceTurn,
  chooseAutoMovePieceId,
  getPlayerTrackCount,
  type GameState,
  type PlayerState,
} from '../../game'
import type { Point, RefreshGameView } from './types'

type TurnControllerOptions = {
  game: Ref<GameState>
  currentPlayer: ComputedRef<PlayerState>
  legalPieces: ComputedRef<string[]>
  autoPlayMode: Ref<boolean>
  isRolling: Ref<boolean>
  movingPoint: Ref<Point | null>
  isPlayPageActive: () => boolean
  renderScene: () => void
  refreshGameView: RefreshGameView
  clearTimers: () => void
  handleRoll: (fromAuto?: boolean) => void
  handleMove: (pieceId: string) => void
}

export function createTurnController(options: TurnControllerOptions) {
  // 可走棋子的脉冲相位（0~1，驱动渲染层呼吸发光）
  const legalPulse = ref(0)
  // 回合切换动画进行中（此期间禁止摇骰/移动，防止状态错乱）
  const isTurnTransitioning = ref(false)
  // 回合交接时短暂隐藏骰子，营造"传给下家"的效果
  const diceHandoffHiding = ref(false)

  let autoTimer: number = -1
  let autoMoveTimer: number = -1
  let turnAdvanceTimer: number = -1
  let turnAccentFrameId: number = -1

  // 是否真人回合（humanControlled 由 mode 决定）
  function isHumanTurn() {
    return options.currentPlayer.value.humanControlled
  }

  function clearAutoTimers() {
    if (autoTimer !== -1) {
      window.clearTimeout(autoTimer)
      autoTimer = -1
    }
    if (autoMoveTimer !== -1) {
      window.clearTimeout(autoMoveTimer)
      autoMoveTimer = -1
    }
  }

  function stopTurnAccentAnimation() {
    if (turnAccentFrameId !== -1) {
      window.cancelAnimationFrame(turnAccentFrameId)
      turnAccentFrameId = -1
    }
    legalPulse.value = 0
  }

  function clearTurnTimers() {
    clearAutoTimers()
    if (turnAdvanceTimer !== -1) {
      window.clearTimeout(turnAdvanceTimer)
      turnAdvanceTimer = -1
    }
    isTurnTransitioning.value = false
    diceHandoffHiding.value = false
    stopTurnAccentAnimation()
  }

  /**
   * 安排一次回合推进：delay 毫秒后调用规则层 advanceTurn 轮到下家。
   * 期间置 isTurnTransitioning=true 锁住交互；到期后若轮到非真人且开启托管则自动继续。
   */
  function scheduleTurnAdvance(delay = 2000) {
    if (!options.isPlayPageActive() || options.game.value.winnerIndex !== -1)
      return
    if (turnAdvanceTimer !== -1) {
      window.clearTimeout(turnAdvanceTimer)
    }
    isTurnTransitioning.value = true
    const timer = window.setTimeout(() => {
      if (turnAdvanceTimer !== timer) return
      turnAdvanceTimer = -1
      if (
        !options.isPlayPageActive() ||
        options.game.value.winnerIndex !== -1
      ) {
        isTurnTransitioning.value = false
        return
      }
      advanceTurn(options.game.value)
      isTurnTransitioning.value = false
      diceHandoffHiding.value = false
      options.refreshGameView()
      if (!isHumanTurn() && options.autoPlayMode.value) {
        scheduleAutoTurn(220)
      }
    }, delay)
    turnAdvanceTimer = timer
  }

  // 条件满足时启动"可走棋子呼吸高亮"动画循环（requestAnimationFrame 驱动 legalPulse）
  function syncTurnAccentAnimation() {
    stopTurnAccentAnimation()

    const shouldAnimate =
      options.isPlayPageActive() &&
      options.game.value.winnerIndex === -1 &&
      options.game.value.dice !== 0 &&
      !options.isRolling.value &&
      options.movingPoint.value === null &&
      options.legalPieces.value.length > 0

    if (!shouldAnimate) return

    const tick = (now: number) => {
      if (
        !options.isPlayPageActive() ||
        options.game.value.winnerIndex !== -1 ||
        options.game.value.dice === 0 ||
        options.isRolling.value ||
        options.movingPoint.value !== null ||
        options.legalPieces.value.length === 0
      ) {
        stopTurnAccentAnimation()
        options.renderScene()
        return
      }

      legalPulse.value = 0.45 + 0.55 * Math.sin(now / 160)
      options.renderScene()
      turnAccentFrameId = window.requestAnimationFrame(tick)
    }

    turnAccentFrameId = window.requestAnimationFrame(tick)
  }

  // 真人玩家可自动代走的场景：掷到 6 且没有棋子在跑道上（只能起飞）、
  // 或只剩唯一合法棋子，此时无需等待玩家点击，直接自动走
  function getHumanAutoMovePieceId() {
    if (options.game.value.dice === 0 || options.game.value.winnerIndex !== -1)
      return ''
    const legalIds = options.legalPieces.value
    if (legalIds.length === 0) return ''
    if (legalIds.length === 1) return legalIds[0] ?? ''
    if (
      getPlayerTrackCount(options.currentPlayer.value) === 0 &&
      options.game.value.dice === 6
    )
      return legalIds[0] ?? ''
    return ''
  }

  // 安排一次"自动回合"（延迟后进入 playAutoTurn 编排流程）
  function scheduleAutoTurn(delay = 180) {
    if (!options.isPlayPageActive() || options.game.value.winnerIndex !== -1)
      return
    if (isTurnTransitioning.value || !options.autoPlayMode.value) return
    if (autoTimer !== -1) {
      window.clearTimeout(autoTimer)
    }
    const timer = window.setTimeout(() => {
      if (autoTimer !== timer) return
      autoTimer = -1
      if (
        !options.isPlayPageActive() ||
        !options.autoPlayMode.value ||
        options.game.value.winnerIndex !== -1
      )
        return
      playAutoTurn()
    }, delay)
    autoTimer = timer
  }

  function scheduleAutoMove(action: () => void, delay: number) {
    if (
      !options.isPlayPageActive() ||
      !options.autoPlayMode.value ||
      options.game.value.winnerIndex !== -1
    )
      return
    if (autoMoveTimer !== -1) {
      window.clearTimeout(autoMoveTimer)
    }
    const timer = window.setTimeout(() => {
      if (autoMoveTimer !== timer) return
      autoMoveTimer = -1
      if (
        !options.isPlayPageActive() ||
        !options.autoPlayMode.value ||
        options.game.value.winnerIndex !== -1
      )
        return
      action()
    }, delay)
    autoMoveTimer = timer
  }

  // 自动回合编排：
  //  - 未掷骰 → 非真人回合自动摇骰
  //  - 已掷骰 → 选择棋子（真人走 getHumanAutoMovePieceId，托管走 chooseAutoMovePieceId）
  //  - 无子可走 → 自动推进回合
  function playAutoTurn() {
    if (
      !options.isPlayPageActive() ||
      !options.autoPlayMode.value ||
      options.game.value.winnerIndex !== -1
    ) {
      clearAutoTimers()
      return
    }
    if (
      isTurnTransitioning.value ||
      options.isRolling.value ||
      options.movingPoint.value !== null
    )
      return

    if (options.game.value.dice === 0) {
      if (!isHumanTurn()) {
        scheduleAutoMove(() => options.handleRoll(true), 220)
      }
      return
    }

    const pieceId = isHumanTurn()
      ? getHumanAutoMovePieceId()
      : chooseAutoMovePieceId(options.game.value)
    if (!pieceId) {
      if (!isHumanTurn()) {
        scheduleTurnAdvance(2000)
      }
      return
    }

    scheduleAutoMove(
      () => options.handleMove(pieceId),
      isHumanTurn() ? 180 : 260,
    )
  }

  return {
    legalPulse,
    isTurnTransitioning,
    diceHandoffHiding,
    isHumanTurn,
    clearAutoTimers,
    clearTurnTimers,
    stopTurnAccentAnimation,
    syncTurnAccentAnimation,
    getHumanAutoMovePieceId,
    scheduleAutoTurn,
    scheduleAutoMove,
    scheduleTurnAdvance,
    playAutoTurn,
  }
}
