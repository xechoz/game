/**
 * 被吃棋子"飞回停机坪"动画（纯状态计算，渲染由 boardRenderer 完成）
 *
 * CapturedFlightState 记录一颗被吃棋子的飞行参数（起点/终点/时长），
 * 渲染层按当前时间插值出 位置/旋转/透明度。
 */
import type { Point } from './types'

export type CapturedFlightState = {
  pieceId: string
  origin: Point
  destination: Point
  color: string
  createdAt: number
  duration: number
}

// 创建一条被吃飞行动画（默认 380ms）
export function createCapturedFlight(
  pieceId: string,
  origin: Point,
  destination: Point,
  color: string,
  duration = 380,
): CapturedFlightState {
  return {
    pieceId,
    origin,
    destination,
    color,
    createdAt: performance.now(),
    duration,
  }
}

// 飞行进度（0~1，按开始时间与时长推算）
export function getCapturedFlightProgress(
  flight: CapturedFlightState,
  now: number,
) {
  return Math.min(1, Math.max(0, (now - flight.createdAt) / flight.duration))
}

// 计算当前渲染状态：缓动位移 + 上升弧线 + 轻微旋转 + 渐隐
export function getCapturedFlightRenderState(
  flight: CapturedFlightState,
  now: number,
) {
  const progress = getCapturedFlightProgress(flight, now)
  const easedProgress = 0.5 - Math.cos(Math.PI * progress) / 2
  const x =
    flight.origin.x + (flight.destination.x - flight.origin.x) * easedProgress
  const y =
    flight.origin.y +
    (flight.destination.y - flight.origin.y) * easedProgress -
    Math.sin(progress * Math.PI) * 12
  const rotation = (1 - easedProgress) * Math.PI * 0.28
  const alpha = 1 - progress * 0.18

  return {
    position: { x, y },
    rotation,
    alpha,
    progress,
  }
}

export function isCapturedFlightComplete(
  flight: CapturedFlightState,
  now: number,
) {
  return now - flight.createdAt >= flight.duration
}
