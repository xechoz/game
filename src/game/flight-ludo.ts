/**
 * 飞行棋核心规则（纯逻辑层，不依赖 Vue / PixiJS）
 *
 * 本文件是整个游戏的状态机：
 *  - GameState 是唯一数据源，渲染层与控制器只读写它
 *  - 所有规则函数都是纯函数式修改 state（直接就地修改并返回结果信息）
 *  - 棋盘几何（格子数、安全格、跳子点）由 board-presets.ts 的 BoardPreset 提供
 *
 * 坐标模型：
 *  - 每个棋子的 progress 表示"从起点出发走了几步"
 *  - progress <= 0          → 在停机坪（base），只有掷出 6 才能起飞
 *  - 1 ~ trackLength        → 在外圈跑道（track）
 *  - trackLength+1 ~ finish → 进入终点跑道（home），不再与外圈交互
 *  - progress >= finishStep → 到达终点（finished）
 */
import {
  DEFAULT_BOARD_PRESET_ID,
  getBoardPreset,
  type BoardPreset,
  type BoardPresetId,
} from './board-presets.ts'

const activeBoardPreset = getBoardPreset()

export const TRACK_STEPS_PER_SIDE = activeBoardPreset.stepsPerEdge
export const TRACK_LENGTH = activeBoardPreset.trackLength
export const HOME_STEPS = activeBoardPreset.homeSteps
export const HOME_ENTRY_STEP = TRACK_LENGTH
export const FINISH_STEP = HOME_ENTRY_STEP + HOME_STEPS

export type GameMode = 1 | 2 | 3 | 4

// 玩家棋子当前所处区域：停机坪 / 外圈跑道 / 终点跑道 / 已到达终点
export type PieceLocation = 'base' | 'track' | 'home' | 'finished'

export interface GameSettings {
  mode: GameMode
  piecesPerPlayer: number
  boardPresetId?: BoardPresetId
}

export interface PieceState {
  id: string
  progress: number
  finished: boolean
}

// 玩家静态元信息（与对局无关的常量属性）
export interface PlayerMeta {
  index: number
  name: 'red' | 'yellow' | 'blue' | 'green'
  color: string
  startIndex: number
  corner: string
  boardPresetId: BoardPresetId
}

export interface PlayerState extends PlayerMeta {
  active: boolean
  humanControlled: boolean
  pieces: PieceState[]
}

// 一局游戏的完整状态（唯一数据源）
export interface GameState {
  mode: GameMode
  piecesPerPlayer: number
  boardPresetId: BoardPresetId
  players: PlayerState[]
  turnOrder: number[]
  turnPointer: number
  currentPlayerIndex: number
  dice: number
  winnerIndex: number
  turnCount: number
  legalPieceIds: string[]
}

// movePiece 的结果信息：
//  - advancePending: 是否需要在展示后推进回合（掷出 6 / 吃子可继续走时不推进）
//  - victory:        是否因此次移动获胜
//  - capturedCount / capturedPieceIds: 吃掉的敌方棋子
export interface MoveResult {
  moved: boolean
  advancePending: boolean
  victory: boolean
  capturedCount: number
  capturedPieceIds: string[]
}

function getPresetId(boardPresetId?: BoardPresetId): BoardPresetId {
  return boardPresetId ?? DEFAULT_BOARD_PRESET_ID
}

function getPresetForId(boardPresetId?: BoardPresetId): BoardPreset {
  return getBoardPreset(getPresetId(boardPresetId))
}

function getPresetForState(
  state: Pick<GameState, 'boardPresetId'>,
): BoardPreset {
  return getPresetForId(state.boardPresetId)
}

function getPresetForPlayer(
  player: Pick<PlayerState, 'boardPresetId'>,
): BoardPreset {
  return getPresetForId(player.boardPresetId)
}

// 把外圈轨道等分成四段，作为四名玩家的起跑线下标（0/1/2/3 分别对应 红/黄/蓝/绿）
function deriveQuarterIndices(
  trackLength: number,
): [number, number, number, number] {
  return [
    0,
    Math.floor(trackLength / 4),
    Math.floor(trackLength / 2),
    Math.floor((trackLength * 3) / 4),
  ]
}

// 根据棋盘预设生成四名玩家的静态定义（颜色、起跑位置、所在角落）
function createPlayerDefs(boardPresetId: BoardPresetId): PlayerMeta[] {
  const boardPreset = getBoardPreset(boardPresetId)
  const startIndices = deriveQuarterIndices(boardPreset.trackLength)

  return [
    {
      index: 0,
      name: 'red',
      color: '#ef4444',
      startIndex: startIndices[0],
      corner: '左上',
      boardPresetId,
    },
    {
      index: 1,
      name: 'yellow',
      color: '#f59e0b',
      startIndex: startIndices[1],
      corner: '右上',
      boardPresetId,
    },
    {
      index: 2,
      name: 'blue',
      color: '#3b82f6',
      startIndex: startIndices[2],
      corner: '右下',
      boardPresetId,
    },
    {
      index: 3,
      name: 'green',
      color: '#22c55e',
      startIndex: startIndices[3],
      corner: '左下',
      boardPresetId,
    },
  ]
}

export const PLAYER_DEFS: PlayerMeta[] = createPlayerDefs(activeBoardPreset.id)
export const SAFE_CELLS = activeBoardPreset.safeCells
export const FLIGHT_JUMPS = new Map<number, number>(
  activeBoardPreset.flightJumps,
)

// 回合顺序：目前固定为 0→1→2→3（mode 字段保留用于未来扩展规则）
export function getTurnOrder(mode: GameMode): number[] {
  void mode
  return [0, 1, 2, 3]
}

// 每名玩家的棋子数量限制在 1~4 之间
export function clampPiecesPerPlayer(value: number): number {
  return Math.min(4, Math.max(1, Math.trunc(value) || 1))
}

/**
 * 加权骰子：当某玩家还没有棋子上跑道时（trackPieceCount === 0），
 * 掷出 6 的概率提升到 50%，避免一直掷不到 6 而无法起飞；
 * 一旦有棋子在跑道上，就恢复均匀随机 1~6。
 */
export function getWeightedDiceRoll(
  trackPieceCount: number,
  randomValue = Math.random(),
): number {
  if (trackPieceCount <= 0) {
    if (randomValue < 0.5) return 6
    return Math.floor((randomValue - 0.5) / (0.5 / 5)) + 1
  }

  return Math.floor(randomValue * 6) + 1
}

// 根据配置创建一局全新游戏：生成玩家、棋子（progress=0 均在停机坪）、重置回合指针
export function createGame(settings: GameSettings): GameState {
  const mode = settings.mode
  const piecesPerPlayer = clampPiecesPerPlayer(settings.piecesPerPlayer)
  const boardPresetId = getPresetId(settings.boardPresetId)
  const playerDefs = createPlayerDefs(boardPresetId)
  const turnOrder = getTurnOrder(mode)

  // humanControlled: 前 mode 个玩家是真人，其余由自动托管控制
  const players = playerDefs.map((player) => ({
    ...player,
    active: true,
    humanControlled: player.index < mode,
    pieces: Array.from({ length: piecesPerPlayer }, (_, pieceIndex) => ({
      id: `${player.index}-${pieceIndex}`,
      progress: 0,
      finished: false,
    })),
  }))

  return {
    mode,
    piecesPerPlayer,
    boardPresetId,
    players,
    turnOrder,
    turnPointer: 0,
    currentPlayerIndex: turnOrder[0] ?? 0,
    dice: 0,
    winnerIndex: -1,
    turnCount: 1,
    legalPieceIds: [],
  }
}

export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex] ?? state.players[0]!
}

// 根据 progress 判断棋子所处区域（base/track/home/finished）
export function getPieceLocation(
  player: PlayerState,
  piece: PieceState,
): PieceLocation {
  const boardPreset = getPresetForPlayer(player)
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps

  if (piece.progress <= 0) return 'base'
  if (piece.progress <= boardPreset.trackLength) return 'track'
  if (piece.progress < finishStep) return 'home'
  return 'finished'
}

// 把棋子在外圈的 progress 换算成全局跑道格子下标（0 起，用于查找跳子点/安全格）
export function getTrackCellIndex(
  player: Pick<PlayerState, 'startIndex' | 'boardPresetId'>,
  piece: Pick<PieceState, 'progress'>,
): number {
  const boardPreset = getPresetForPlayer(player)
  if (piece.progress <= 0 || piece.progress > boardPreset.trackLength) return -1
  return (player.startIndex + piece.progress - 1) % boardPreset.trackLength
}

// 棋子进入终点跑道后，返回其在跑道内的槽位下标（0 起）；不在跑道内返回 -1
export function getHomeLaneIndex(
  piece: PieceState,
  boardPresetId: BoardPresetId = DEFAULT_BOARD_PRESET_ID,
): number {
  const boardPreset = getPresetForId(boardPresetId)
  if (
    piece.progress <= boardPreset.trackLength ||
    piece.progress >= boardPreset.trackLength + boardPreset.homeSteps
  )
    return -1
  return piece.progress - boardPreset.trackLength - 1
}

// 规则判定：当前骰子点数下，这颗棋子能否移动
//  - 停机坪棋子：必须掷出 6 才能起飞
//  - 跑道/终点跑道棋子：步数不能越过终点
function canPieceMove(state: GameState, piece: PieceState): boolean {
  const boardPreset = getPresetForState(state)
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps

  if (state.dice <= 0 || state.winnerIndex !== -1 || piece.finished)
    return false
  if (piece.progress <= 0) return state.dice === 6
  return piece.progress + state.dice <= finishStep
}

/**
 * 计算一次移动的完整"轨迹"（progress 序列），供移动动画逐帧回放。
 * 轨迹中可能包含跳子点：落到带跳子映射的格子后，会直接顺移到目标格。
 * 停机坪起飞（掷出 6）时轨迹为 [1]。
 */
export function buildMoveTrajectory(
  player: PlayerState,
  piece: PieceState,
  dice: number,
): number[] {
  const boardPreset = getPresetForPlayer(player)
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps
  const flightJumps = new Map<number, number>(boardPreset.flightJumps)
  const steps: number[] = []
  let progress = piece.progress

  if (progress <= 0) {
    if (dice !== 6) return steps
    progress = 1
    steps.push(progress)
    return steps
  }

  const target = Math.min(progress + dice, finishStep)
  while (progress < target) {
    progress += 1
    steps.push(progress)

    while (progress >= 1 && progress <= boardPreset.trackLength) {
      const landingCell = getTrackCellIndex(player, { ...piece, progress })
      if (landingCell < 0) break
      const jumpTarget = flightJumps.get(landingCell)
      if (jumpTarget === undefined) break
      progress += jumpTarget - landingCell
      steps.push(progress)
    }
  }

  return steps
}

/**
 * 自动托管时选择要移动的棋子：
 * 优先选能走得最远的棋子（终点 progress 最大），
 * 走同样远时选出发位置更靠前的，保证托管行为可预期。
 */
export function chooseAutoMovePieceId(state: GameState): string {
  if (state.dice <= 0 || state.winnerIndex !== -1) return ''

  const player = getCurrentPlayer(state)
  const candidates = player.pieces
    .filter((piece) => canPieceMove(state, piece))
    .map((piece) => ({
      piece,
      trajectory: buildMoveTrajectory(player, piece, state.dice),
    }))

  if (candidates.length === 0) return ''

  candidates.sort((left, right) => {
    const leftEnd = left.trajectory.at(-1) ?? left.piece.progress
    const rightEnd = right.trajectory.at(-1) ?? right.piece.progress
    if (rightEnd !== leftEnd) return rightEnd - leftEnd
    return left.piece.progress - right.piece.progress
  })

  return candidates[0]?.piece.id ?? ''
}

// 返回当前玩家所有可以合法移动的棋子 id（无人机时为空数组）
export function getLegalPieceIds(state: GameState): string[] {
  if (state.dice <= 0 || state.winnerIndex !== -1) return []

  const player = getCurrentPlayer(state)
  return player.pieces
    .filter((piece) => canPieceMove(state, piece))
    .map((piece) => piece.id)
}

/**
 * 摇骰入口（规则层）。
 *  - 掷出点数并写入 state.dice
 *  - 若当前玩家没有任何合法棋子可走：立即 advanceTurn 跳到下一玩家（skipped=true）
 *  - 否则等待玩家从 legalPieceIds 中选择棋子移动
 */
export function rollDice(state: GameState): {
  rolled: boolean
  skipped: boolean
  advancePending: boolean
} {
  if (state.winnerIndex !== -1) {
    return {
      rolled: false,
      skipped: false,
      advancePending: false,
    }
  }

  if (state.dice !== 0) {
    return {
      rolled: false,
      skipped: false,
      advancePending: false,
    }
  }

  const player = getCurrentPlayer(state)
  const trackPieceCount = getPlayerTrackCount(player)
  state.dice = getWeightedDiceRoll(trackPieceCount)

  const legalPieces = getLegalPieceIds(state)
  state.legalPieceIds = legalPieces
  if (legalPieces.length === 0) {
    advanceTurn(state)
    return {
      rolled: true,
      skipped: true,
      advancePending: false,
    }
  }

  return {
    rolled: true,
    skipped: false,
    advancePending: false,
  }
}

/**
 * 移动棋子（规则层核心，包含完整规则链）：
 *  1. 校验（已掷骰 / 未结束 / 棋子属于当前玩家 / 可以移动）
 *  2. 起飞或前进 dice 步；循环处理跳子点（可能连续跳）
 *  3. 吃子：落点非安全格时，把该格上所有敌方棋子送回停机坪
 *  4. 判定胜利：本方全部棋子到达终点
 *  5. 结算回合：掷出 6 或吃到子 → 不推进回合（可继续走）；否则 advancePending=true
 */
export function movePiece(
  state: GameState,
  pieceId: string,
  options: { deferAdvanceTurn?: boolean } = {},
): MoveResult {
  void options

  if (state.dice <= 0) {
    return {
      moved: false,
      advancePending: false,
      victory: false,
      capturedCount: 0,
      capturedPieceIds: [],
    }
  }

  if (state.winnerIndex !== -1) {
    return {
      moved: false,
      advancePending: false,
      victory: false,
      capturedCount: 0,
      capturedPieceIds: [],
    }
  }

  const boardPreset = getPresetForState(state)
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps
  const flightJumps = new Map<number, number>(boardPreset.flightJumps)
  const player = getCurrentPlayer(state)
  const piece = player.pieces.find((item) => item.id === pieceId)
  if (!piece) {
    return {
      moved: false,
      advancePending: false,
      victory: false,
      capturedCount: 0,
      capturedPieceIds: [],
    }
  }

  if (!canPieceMove(state, piece)) {
    return {
      moved: false,
      advancePending: false,
      victory: false,
      capturedCount: 0,
      capturedPieceIds: [],
    }
  }

  const dice = state.dice
  const rolledSix = dice === 6

  // 起飞：停机坪棋子掷到 6 直接落到起点格（progress = 1）；否则前进 dice 步
  if (piece.progress <= 0) {
    piece.progress = 1
  } else {
    piece.progress += dice
  }

  // 跳子：落点若是跳子点，沿映射连续顺移，直到落回普通格子或离开外圈
  while (piece.progress >= 1 && piece.progress <= boardPreset.trackLength) {
    const landingCell = getTrackCellIndex(player, piece)
    const jumpTarget = flightJumps.get(landingCell)
    if (jumpTarget === undefined) break

    const jumpDelta = jumpTarget - landingCell
    piece.progress += jumpDelta
  }

  // 吃子：落点在外圈且不是安全格时，同格敌方棋子全部送回停机坪
  let captured = 0
  const capturedPieceIds: string[] = []
  const landingCell = getTrackCellIndex(player, piece)

  if (
    piece.progress <= boardPreset.trackLength &&
    landingCell >= 0 &&
    !boardPreset.safeCells[player.index].includes(landingCell)
  ) {
    for (const enemy of state.players) {
      if (!enemy.active || enemy.index === player.index) continue

      for (const enemyPiece of enemy.pieces) {
        if (
          enemyPiece.progress <= 0 ||
          enemyPiece.progress > boardPreset.trackLength
        )
          continue

        const enemyCell = getTrackCellIndex(enemy, enemyPiece)
        if (enemyCell === landingCell) {
          enemyPiece.progress = 0
          enemyPiece.finished = false
          captured += 1
          capturedPieceIds.push(enemyPiece.id)
        }
      }
    }
  }

  // 消耗骰子点数，本次移动完成
  state.dice = 0
  state.legalPieceIds = []

  // 胜利判定：本方所有棋子都到达终点，并把越界 progress 收敛到 finishStep
  const finishedCount = player.pieces.filter(
    (item) => item.progress >= finishStep,
  ).length
  player.pieces.forEach((item) => {
    item.finished = item.progress >= finishStep
    if (item.finished) item.progress = finishStep
  })

  if (finishedCount === player.pieces.length) {
    state.winnerIndex = player.index
    return {
      moved: true,
      advancePending: false,
      victory: true,
      capturedCount: captured,
      capturedPieceIds,
    }
  }

  // 掷出 6：不推进回合，同一玩家可继续走（advancePending=false）
  if (rolledSix) {
    return {
      moved: true,
      advancePending: false,
      victory: false,
      capturedCount: captured,
      capturedPieceIds,
    }
  }

  // 普通移动：本次走完，需要推进回合到下一玩家
  return {
    moved: true,
    advancePending: true,
    victory: false,
    capturedCount: captured,
    capturedPieceIds,
  }
}

// 回合推进：清空骰子、轮到下一位玩家、回合计数 +1
export function advanceTurn(state: GameState): void {
  if (state.winnerIndex !== -1) return

  state.dice = 0
  state.legalPieceIds = []
  state.turnPointer = (state.turnPointer + 1) % state.turnOrder.length
  state.currentPlayerIndex = state.turnOrder[state.turnPointer] ?? 0
  state.turnCount += 1
}

export function resetGame(settings: GameSettings): GameState {
  return createGame(settings)
}

// 统计：某玩家已到达终点的棋子数量
export function getPlayerFinishedCount(player: PlayerState): number {
  const boardPreset = getPresetForPlayer(player)
  const finishStep = boardPreset.trackLength + boardPreset.homeSteps
  return player.pieces.filter(
    (piece) => piece.progress >= finishStep || piece.finished,
  ).length
}

// 统计：某玩家当前在外圈跑道上的棋子数量（用于加权骰子）
export function getPlayerTrackCount(player: PlayerState): number {
  const boardPreset = getPresetForPlayer(player)
  return player.pieces.filter(
    (piece) =>
      piece.progress >= 1 &&
      piece.progress <= boardPreset.trackLength &&
      !piece.finished,
  ).length
}

// 判断某个跑道格子是否为某玩家的安全格（安全格上不会被吃）
export function isSafeCell(
  playerIndex: number,
  cellIndex: number,
  boardPresetId: BoardPresetId = DEFAULT_BOARD_PRESET_ID,
): boolean {
  return getPresetForId(boardPresetId).safeCells[playerIndex].includes(
    cellIndex,
  )
}
