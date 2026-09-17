/**
 * 骰子控制器（diceController）
 *
 * 职责：
 *  - 摇骰流程编排：旋转动画（startDiceSpin）→ 落定弹跳（startDiceLandingAnimation）→ 调用规则层 rollDice
 *  - 骰子空闲时的呼吸/涟漪动画（syncDiceIdleAnimation）
 *  - 通过一组 ref 把动画状态暴露给渲染层（diceSpinScale / diceLandingLift / ...）
 *
 * 交互入口 handleRoll 同时服务真人点击与自动托管（fromAuto）。
 */
import { ref, type Ref } from 'vue'

import { rollDice, type GameState } from '../../game'
import type { Point, RefreshGameView } from './types'

type DiceControllerOptions = {
  game: Ref<GameState>
  autoPlayMode: Ref<boolean>
  movingPoint: Ref<Point | null>
  diceHandoffHiding: Ref<boolean>
  isTurnTransitioning: Ref<boolean>
  isPlayPageActive: () => boolean
  isHumanTurn: () => boolean
  clearTimers: () => void
  renderScene: () => void
  syncDiceScene: () => void
  refreshGameView: RefreshGameView
  scheduleAutoTurn: (delay?: number) => void
  scheduleAutoMove: (action: () => void, delay: number) => void
  scheduleTurnAdvance: (delay?: number) => void
  getHumanAutoMovePieceId: () => string
  handleMove: (pieceId: string) => void
  playRollSound: () => void
}

export function createDiceController(options: DiceControllerOptions) {
  // —— 骰子动画状态（渲染层读取）——
  const rollingFace = ref<number>(1)
  const diceRollFrame = ref(0)
  const diceSpinScale = ref(1)
  const diceSpinRotation = ref(0)
  const diceSpinFlip = ref(1)
  const diceLandingLift = ref(0)
  const diceLandingSquash = ref(0)
  const diceResultPop = ref(0)
  const diceIdlePulse = ref(0)
  const idleRipple = ref(0)
  const isRolling = ref(false)

  let rollTimer: number = -1
  let rollFrameId: number = -1
  let diceLandingFrameId: number = -1
  let diceIdleFrameId: number = -1
  let diceIdleLastRender = 0
  let diceIdleStart = 0

  function clearRollTimers() {
    if (rollTimer !== -1) {
      window.clearTimeout(rollTimer)
      rollTimer = -1
    }
    if (rollFrameId !== -1) {
      window.cancelAnimationFrame(rollFrameId)
      rollFrameId = -1
    }
  }

  // 停止并复位所有骰子动画状态
  function stopDiceIdleAnimation() {
    if (diceIdleFrameId !== -1) {
      window.cancelAnimationFrame(diceIdleFrameId)
      diceIdleFrameId = -1
    }
    if (diceLandingFrameId !== -1) {
      window.cancelAnimationFrame(diceLandingFrameId)
      diceLandingFrameId = -1
    }
    diceIdleLastRender = 0
    diceSpinRotation.value = 0
    diceSpinFlip.value = 1
    diceLandingLift.value = 0
    diceLandingSquash.value = 0
    diceResultPop.value = 0
    diceIdlePulse.value = 0
    idleRipple.value = 0
  }

  function resetDiceState() {
    clearRollTimers()
    stopDiceIdleAnimation()
    isRolling.value = false
    diceSpinScale.value = 1
    rollingFace.value = 1
  }

  // 展示给玩家看的点数：摇骰中显示正在转的随机面，落定后显示规则层的真实结果
  function getDiceDisplayValue() {
    if (isRolling.value) return rollingFace.value
    return options.game.value.dice
  }

  // 骰子空闲动画：等待摇骰时做呼吸脉冲 + 涟漪扩散（80ms 节流重渲染）
  function syncDiceIdleAnimation() {
    stopDiceIdleAnimation()

    const shouldAnimate =
      options.isPlayPageActive() &&
      options.game.value.winnerIndex === -1 &&
      options.game.value.dice === 0 &&
      !isRolling.value &&
      options.movingPoint.value === null &&
      !options.diceHandoffHiding.value &&
      !options.isTurnTransitioning.value

    if (!shouldAnimate) return

    diceIdleStart = performance.now()

    const tick = (now: number) => {
      if (
        !options.isPlayPageActive() ||
        options.game.value.winnerIndex !== -1 ||
        options.game.value.dice !== 0 ||
        isRolling.value ||
        options.movingPoint.value !== null ||
        options.diceHandoffHiding.value ||
        options.isTurnTransitioning.value
      ) {
        stopDiceIdleAnimation()
        options.renderScene()
        return
      }

      if (diceIdleLastRender === 0 || now - diceIdleLastRender >= 80) {
        const elapsed = now - diceIdleStart
        diceIdlePulse.value = 0.5 + 0.5 * Math.sin(elapsed / 240)
        idleRipple.value = (elapsed % 1500) / 1500
        diceIdleLastRender = now
        options.renderScene()
      }

      diceIdleFrameId = window.requestAnimationFrame(tick)
    }

    diceIdleFrameId = window.requestAnimationFrame(tick)
  }

  // 骰子落定弹跳：420ms 内做 bounce/rebound/压扁/弹出 的组合动画，结束后复位
  function startDiceLandingAnimation() {
    if (diceLandingFrameId !== -1) {
      window.cancelAnimationFrame(diceLandingFrameId)
      diceLandingFrameId = -1
    }

    const startTime = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / 420)
      const bounce = Math.sin(progress * Math.PI) * (1 - progress)
      const rebound = Math.sin(progress * Math.PI * 2.6) * (1 - progress) * 0.28
      diceLandingLift.value = Math.max(0, bounce * 20 + rebound * 8)
      diceLandingSquash.value = Math.max(
        0,
        Math.sin(progress * Math.PI * 1.2) * (1 - progress * 0.58),
      )
      diceResultPop.value = Math.max(
        0,
        Math.sin(progress * Math.PI * 1.35) * (1 - progress * 0.42),
      )
      options.syncDiceScene()

      if (progress < 1) {
        diceLandingFrameId = window.requestAnimationFrame(animate)
      } else {
        diceLandingFrameId = -1
        diceLandingLift.value = 0
        diceLandingSquash.value = 0
        diceResultPop.value = 0
        options.syncDiceScene()
      }
    }

    diceLandingFrameId = window.requestAnimationFrame(animate)
  }

  // 摇骰旋转动画：约 1.1s，点数随机切换 + 旋转/缩放/翻转抖动，结束时复位并触发规则判定
  function startDiceSpin() {
    const startTime = performance.now()
    let lastTick = 0

    const spin = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / 1100)
      const interval = Math.max(55, 165 - progress * 88)
      const tick = Math.floor(elapsed / interval)
      while (lastTick < tick) {
        rollingFace.value = Math.floor(Math.random() * 6) + 1
        lastTick += 1
      }
      const wobbleDecay = 1 - progress * 0.22
      const turnProgress = 1 - (1 - progress) * (1 - progress)
      diceSpinScale.value = 1 + Math.sin(progress * Math.PI) * 0.06
      diceSpinRotation.value =
        Math.sin(progress * Math.PI * 4.8) * 0.26 * wobbleDecay +
        turnProgress * Math.PI * 0.1
      diceSpinFlip.value =
        0.46 + Math.abs(Math.cos(progress * Math.PI * 6.8)) * 0.54
      options.syncDiceScene()
      if (progress < 1) {
        rollFrameId = window.requestAnimationFrame(spin)
      } else {
        rollFrameId = -1
        diceSpinScale.value = 1
        diceSpinRotation.value = 0
        diceSpinFlip.value = 1
        options.syncDiceScene()
      }
    }

    rollFrameId = window.requestAnimationFrame(spin)
  }

  /**
   * 摇骰交互入口（真人点击 / 自动托管均可触发，托管需 fromAuto=true）。
   * 流程：守卫校验 → 旋转动画 → 随机面切换 6 次 → 调规则层 rollDice
   *  → 落定动画 → 按结果分派：
   *     skipped（无子可走，已自动过回合）/ 可直接代走（getHumanAutoMovePieceId）
   *     / advancePending（安排回合推进）/ 托管继续摇下一位
   */
  function handleRoll(fromAuto = false) {
    if (
      options.game.value.winnerIndex !== -1 ||
      options.game.value.dice !== 0 ||
      isRolling.value ||
      options.isTurnTransitioning.value ||
      options.movingPoint.value !== null
    )
      return
    if (!options.isHumanTurn() && !fromAuto) return

    options.clearTimers()
    isRolling.value = true
    rollingFace.value = Math.floor(Math.random() * 6) + 1
    diceRollFrame.value = 0
    diceSpinScale.value = 1
    diceLandingLift.value = 0
    diceLandingSquash.value = 0
    startDiceSpin()

    let ticks = 0
    const spin = () => {
      if (!isRolling.value) return
      rollingFace.value = Math.floor(Math.random() * 6) + 1
      ticks += 1
      if (ticks < 6) {
        rollTimer = window.setTimeout(spin, 55)
        return
      }

      isRolling.value = false
      rollTimer = -1
      const result = rollDice(options.game.value)
      if (!result.rolled) return

      startDiceLandingAnimation()
      options.playRollSound()
      options.refreshGameView()

      if (result.skipped) {
        if (!options.isHumanTurn() && options.autoPlayMode.value) {
          options.scheduleAutoTurn(220)
        }
        return
      }

      const humanAutoPieceId = options.isHumanTurn()
        ? options.getHumanAutoMovePieceId()
        : ''
      if (humanAutoPieceId) {
        options.scheduleAutoMove(
          () => options.handleMove(humanAutoPieceId),
          220,
        )
        return
      }

      if (result.advancePending) {
        options.scheduleTurnAdvance(2000)
      }

      if (!options.isHumanTurn() && options.autoPlayMode.value) {
        options.scheduleAutoTurn(220)
      }
    }

    spin()
  }

  return {
    rollingFace,
    diceRollFrame,
    diceSpinScale,
    diceSpinRotation,
    diceSpinFlip,
    diceLandingLift,
    diceLandingSquash,
    diceResultPop,
    diceIdlePulse,
    idleRipple,
    isRolling,
    getDiceDisplayValue,
    clearRollTimers,
    stopDiceIdleAnimation,
    resetDiceState,
    syncDiceIdleAnimation,
    handleRoll,
  }
}
