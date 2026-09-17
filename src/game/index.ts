/**
 * src/game 桶导出（barrel）
 *
 * 对外只暴露纯逻辑 API：棋盘预设 + 飞行棋规则状态机。
 * 渲染层 / 控制器 / Vue 组件统一从这里 import，避免依赖内部文件路径。
 */
export * from './board-presets'

export {
  FLIGHT_JUMPS,
  HOME_STEPS,
  SAFE_CELLS,
  TRACK_STEPS_PER_SIDE,
  type GameMode,
  type GameSettings,
  type GameState,
  type PieceState,
  type PlayerState,
  PLAYER_DEFS,
  TRACK_LENGTH,
  buildMoveTrajectory,
  FINISH_STEP,
  chooseAutoMovePieceId,
  clampPiecesPerPlayer,
  createGame,
  getCurrentPlayer,
  getHomeLaneIndex,
  getLegalPieceIds,
  getPieceLocation,
  getPlayerFinishedCount,
  getPlayerTrackCount,
  getTrackCellIndex,
  movePiece,
  isSafeCell,
  resetGame,
  rollDice,
  advanceTurn,
} from './flight-ludo'
