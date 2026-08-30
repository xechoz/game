import type { Point } from './types'

// 折线总长度（连接停机坪→终点跑道的虚线用）
export function getPolylineLength(points: Point[]) {
  if (points.length < 2) {
    return 0
  }

  let totalLength = 0
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    totalLength += Math.hypot(to.x - from.x, to.y - from.y)
  }

  return totalLength
}

// 停机坪→终点连接线的虚线间距：按折线总长与跑道格数均分，保证格数多时点距不挤
export function getHomeConnectorDotSpacing(
  points: Point[],
  homeSteps: number,
  trackSize: number,
) {
  const connectorLength = getPolylineLength(points)
  if (connectorLength === 0 || homeSteps <= 0) {
    return Math.max(8, trackSize * 0.55)
  }

  return Math.max(8, connectorLength / Math.max(1, homeSteps))
}
