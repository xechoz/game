/**
 * 棋盘几何计算（纯函数，无副作用）
 *
 * 输入：画布原点/尺寸 + BoardPreset（格子数）+ BoardRenderLayout（比例参数）
 * 输出：BoardLayout —— 一组可直接用于 PIXI 绘制的像素坐标：
 *  - trackPoints: 外圈跑道格子中心点（长度 = trackLength）
 *  - baseSlots:   四角停机坪槽位（每玩家 piecesPerPlayer 个槽）
 *  - finishSlots: 终点跑道格子（每玩家 homeSteps 个）
 *  - 各边边界点 / 终点跑道入口点
 *
 * 与规则层无关：规则用格子下标抽象，渲染层用这里的像素坐标。
 */
import type { BoardRenderLayout } from '../../game'
import type { BoardLayout } from './types'

type BoardPresetLayoutInput = {
  trackLength: number
  stepsPerEdge: number
  homeSteps: number
}

// 线性插值
function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

// 在 start→end 连线上均匀生成 count 个点（含两端）
function buildLinePoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  count: number,
) {
  if (count <= 1) return [{ x: start.x, y: start.y }]

  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1)
    return {
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
    }
  })
}

// 按顺时针生成矩形的四条边点（首尾相连，去重公共顶点后即完整周长）
function buildPerimeterPoints(
  left: number,
  right: number,
  top: number,
  bottom: number,
  stepsPerEdge: number,
) {
  const topSide = buildLinePoints(
    { x: left, y: top },
    { x: right, y: top },
    stepsPerEdge,
  )
  const rightSide = buildLinePoints(
    { x: right, y: top },
    { x: right, y: bottom },
    stepsPerEdge,
  )
  const bottomSide = buildLinePoints(
    { x: right, y: bottom },
    { x: left, y: bottom },
    stepsPerEdge,
  )
  const leftSide = buildLinePoints(
    { x: left, y: bottom },
    { x: left, y: top },
    stepsPerEdge,
  )

  return {
    topSide,
    rightSide,
    bottomSide,
    leftSide,
    perimeterPoints: [
      ...topSide,
      ...rightSide.slice(1),
      ...bottomSide.slice(1),
      ...leftSide.slice(1),
    ],
  }
}

export function buildBoardLayout(
  originX: number,
  originY: number,
  size: number,
  boardPreset: BoardPresetLayoutInput,
  boardRenderLayout: BoardRenderLayout,
): BoardLayout {
  // 外圈矩形四条边按比例内缩，得到跑道范围
  const trackInset = size * boardRenderLayout.trackInsetRatio
  const left = originX + trackInset
  const right = originX + size - trackInset
  const top = originY + trackInset
  const bottom = originY + size - trackInset
  const centerX = originX + size / 2
  const centerY = originY + size / 2

  const { topSide, rightSide, bottomSide, leftSide, perimeterPoints } =
    buildPerimeterPoints(left, right, top, bottom, boardPreset.stepsPerEdge)

  // 外圈路径：保持闭合矩形外环，左侧只比其它三边少一个点，用来匹配当前 trackLength。
  const leftRouteSide = buildLinePoints(
    { x: left, y: bottom },
    { x: left, y: top },
    boardPreset.stepsPerEdge,
  )

  // 跑道点序列：上→右→下→左，去掉每边重复的顶点，总长度恰为 trackLength
  const trackPoints = [
    ...topSide,
    ...rightSide.slice(1),
    ...bottomSide.slice(1),
    ...leftRouteSide.slice(1),
  ]

  const outerBorderPoints = perimeterPoints

  // 四个角的停机坪槽位：每个象限内按 spread 散布 4 个槽（2×2）
  const buildBaseSlots = () => {
    const spread = size * boardRenderLayout.baseSlotSpreadRatio
    const quadrantInset = size * boardRenderLayout.baseZonePaddingRatio
    const quadrantBounds = [
      {
        minX: left + quadrantInset,
        maxX: centerX - quadrantInset,
        minY: top + quadrantInset,
        maxY: centerY - quadrantInset,
      },
      {
        minX: centerX + quadrantInset,
        maxX: right - quadrantInset,
        minY: top + quadrantInset,
        maxY: centerY - quadrantInset,
      },
      {
        minX: centerX + quadrantInset,
        maxX: right - quadrantInset,
        minY: centerY + quadrantInset,
        maxY: bottom - quadrantInset,
      },
      {
        minX: left + quadrantInset,
        maxX: centerX - quadrantInset,
        minY: centerY + quadrantInset,
        maxY: bottom - quadrantInset,
      },
    ]

    return quadrantBounds.map((bounds) => {
      const slotCenterX = (bounds.minX + bounds.maxX) / 2
      const slotCenterY = (bounds.minY + bounds.maxY) / 2
      return [
        { x: slotCenterX - spread, y: slotCenterY - spread },
        { x: slotCenterX + spread, y: slotCenterY - spread },
        { x: slotCenterX - spread, y: slotCenterY + spread },
        { x: slotCenterX + spread, y: slotCenterY + spread },
      ]
    })
  }

  // 各玩家终点跑道：从边中点锚点出发，向棋盘中心方向收缩 finishGap 后，
  // 等距插值出 homeSteps 个格子（laneIndex 越大越靠近终点）
  const buildFinishSlots = (originXValue: number, originYValue: number) => {
    const slotCenterX = originXValue + size / 2
    const slotCenterY = originYValue + size / 2
    const finishGap = size * boardRenderLayout.finishGapRatio

    const laneAnchors = [
      leftSide[Math.floor((leftSide.length - 1) / 2)] ??
        leftSide[0] ?? { x: left, y: centerY },
      topSide[Math.floor((topSide.length - 1) / 2)] ??
        topSide[0] ?? { x: centerX, y: top },
      rightSide[Math.floor((rightSide.length - 1) / 2)] ??
        rightSide[0] ?? { x: right, y: centerY },
      bottomSide[Math.floor((bottomSide.length - 1) / 2)] ??
        bottomSide[0] ?? { x: centerX, y: bottom },
    ]

    const getFinishTarget = (anchor: { x: number; y: number }) => {
      const dx = slotCenterX - anchor.x
      const dy = slotCenterY - anchor.y
      const distance = Math.hypot(dx, dy)

      if (distance === 0) {
        return { x: slotCenterX, y: slotCenterY }
      }

      const targetDistance = Math.max(0, distance - finishGap)
      const scale = targetDistance / distance

      return {
        x: anchor.x + dx * scale,
        y: anchor.y + dy * scale,
      }
    }

    return laneAnchors.map((anchor) => {
      const finishTarget = getFinishTarget(anchor)

      return Array.from({ length: boardPreset.homeSteps }, (_, laneIndex) => {
        const t = (laneIndex + 1) / boardPreset.homeSteps
        return {
          x: lerp(anchor.x, finishTarget.x, t),
          y: lerp(anchor.y, finishTarget.y, t),
        }
      })
    })
  }

  const homeEntryPoints = [
    leftSide[Math.floor((leftSide.length - 1) / 2)] ??
      leftSide[0] ?? { x: left, y: centerY },
    topSide[Math.floor((topSide.length - 1) / 2)] ??
      topSide[0] ?? { x: centerX, y: top },
    rightSide[Math.floor((rightSide.length - 1) / 2)] ??
      rightSide[0] ?? { x: right, y: centerY },
    bottomSide[Math.floor((bottomSide.length - 1) / 2)] ??
      bottomSide[0] ?? { x: centerX, y: bottom },
  ]

  return {
    trackPoints,
    outerBorderPoints,
    topBorderPoints: topSide,
    rightBorderPoints: rightSide,
    bottomBorderPoints: bottomSide,
    leftBorderPoints: leftSide,
    homeEntryPoints,
    baseSlots: buildBaseSlots(),
    finishSlots: buildFinishSlots(originX, originY),
  }
}
