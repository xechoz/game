/**
 * 棋盘预设（BoardPreset）
 *
 * 一套 preset 定义了棋盘几何与规则的静态参数，目前内置三档难度：
 *  - tiny-3  : 每边 3 格，跑道 8 格（快速对局）
 *  - normal-5: 每边 5 格，跑道 16 格（标准对局）
 *  - hell-7  : 每边 7 格，跑道 22 格（地狱模式）
 *
 * 坐标/术语约定：
 *  - player 0 左上、1 右上、2 右下、3 左下（顺时针）
 *  - progress 0 表示停机坪（base），跑道格从 1 开始
 *  - 掷出 6 时棋子从停机坪起飞到起点格（index 1，是安全格）
 *  - trackLength 是外圈最后一个格子（进终点跑道前的下标）
 *  - homeSteps 是终点跑道的格数
 */
export type BoardPresetId = 'tiny-3' | 'normal-5' | 'hell-7'

export interface BoardPreset {
  id: BoardPresetId
  label: string
  stepsPerEdge: number
  homeSteps: number
  trackLength: number // outer track length, excluding home stretch
  startIndices: [number, number, number, number] // the starting cell index for each player, in player order, from 1
  safeCells: SafeCellInfo // key is player index, value is array of safe cell indices for that player, including start cell
  flightJumps: Array<[number, number]>
}

export type SafeCellInfo = {
  [playerIndex: number]: Array<number>
}

// 纯渲染参数：控制棋盘各元素相对整体大小的比例（与规则无关，用于调版式）
export interface BoardRenderLayout {
  trackInsetRatio: number
  trackSizeRatio: number
  baseZonePaddingRatio: number
  baseSlotSpreadRatio: number
  finishGapRatio: number
  finishBoxSizeRatio: number
}

// 外圈跑道总长：默认周长公式 4 * (stepsPerEdge - 1)，大棋盘用硬编码例外保持对称
export function deriveOuterLength(stepsPerEdge: number): number {
  // Prefer a simple perimeter formula: 4 * (stepsPerEdge - 1)
  // Known exceptions for larger presets are encoded to keep symmetric layouts
  if (stepsPerEdge === 7) return 22
  return 4 * (stepsPerEdge - 1)
}

// top left, top right, bottom right, bottom left
// top left is 1,
// for 3 steps per edge, the quarter indices are 1, 2, 4, 5
function deriveQuarterIndices(
  stepsPerEdge: number,
): [number, number, number, number] {
  // Start indices are derived directly from steps per edge to keep consistent spacing
  // Pattern: [1, stepsPerEdge, 2*stepsPerEdge - 1, 3*stepsPerEdge - 2]
  return [1, stepsPerEdge, 2 * stepsPerEdge - 1, 3 * stepsPerEdge - 2]
}

// 工厂函数：默认每个玩家仅起点格为安全格，无跳子点（后续可按 preset 覆盖）
function createPreset(
  id: BoardPresetId,
  label: string,
  stepsPerEdge: number,
  homeSteps: number,
): BoardPreset {
  const trackLength = deriveOuterLength(stepsPerEdge)
  const startIndices = deriveQuarterIndices(stepsPerEdge)
  return {
    id,
    label,
    stepsPerEdge,
    trackLength,
    homeSteps,
    startIndices,
    safeCells: {
      0: [startIndices[0]],
      1: [startIndices[1]],
      2: [startIndices[2]],
      3: [startIndices[3]],
    },
    flightJumps: [],
  }
}

const tiny3Preset = createPreset('tiny-3', '快速 3 步', 3, 2)
const normal5Preset = createPreset('normal-5', '标准 5 步', 5, 4)
const hell7Preset = createPreset('hell-7', '地狱 7 步', 7, 5)
// Adjust safe cells for the 7-step preset to match board geometry expectations
// 地狱模式起跑线位于边中点（而非顶点），需要显式指定各玩家起点安全格
hell7Preset.safeCells = {
  0: [1],
  1: [6],
  2: [12],
  3: [17],
}

// 三个预设对应的渲染布局比例（值越小棋盘元素越紧凑，适配不同格子数）
const boardRenderLayouts: Record<BoardPresetId, BoardRenderLayout> = {
  'tiny-3': {
    trackInsetRatio: 0.029,
    trackSizeRatio: 0.082,
    baseZonePaddingRatio: 0.029,
    baseSlotSpreadRatio: 0.031,
    finishGapRatio: 0.13,
    finishBoxSizeRatio: 0.036,
  },
  'normal-5': {
    trackInsetRatio: 0.029,
    trackSizeRatio: 0.068,
    baseZonePaddingRatio: 0.029,
    baseSlotSpreadRatio: 0.031,
    finishGapRatio: 0.13,
    finishBoxSizeRatio: 0.03,
  },
  'hell-7': {
    trackInsetRatio: 0.029,
    trackSizeRatio: 0.058,
    baseZonePaddingRatio: 0.029,
    baseSlotSpreadRatio: 0.031,
    finishGapRatio: 0.13,
    finishBoxSizeRatio: 0.026,
  },
}

export const DEFAULT_BOARD_PRESET_ID: BoardPresetId = 'tiny-3'

// 预设注册表：新增棋盘难度时在此登记即可全局生效
export const BOARD_PRESETS: Record<BoardPresetId, BoardPreset> = {
  'tiny-3': tiny3Preset,
  'normal-5': normal5Preset,
  'hell-7': hell7Preset,
}

// 按 id 获取棋盘预设（默认 tiny-3）
export function getBoardPreset(
  boardPresetId: BoardPresetId = DEFAULT_BOARD_PRESET_ID,
): BoardPreset {
  return BOARD_PRESETS[boardPresetId]
}

// 按 id 获取渲染布局参数
export function getBoardRenderLayout(
  boardPresetId: BoardPresetId = DEFAULT_BOARD_PRESET_ID,
): BoardRenderLayout {
  return boardRenderLayouts[boardPresetId]
}
