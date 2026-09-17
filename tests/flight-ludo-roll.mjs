import assert from 'node:assert/strict'
import {
  createGame,
  getPlayerTrackCount,
  getWeightedDiceRoll,
  rollDice,
  movePiece,
} from '../src/game/flight-ludo.ts'

assert.equal(getWeightedDiceRoll(0, 0.1), 6, 'no track pieces should favor 6')
assert.equal(
  getWeightedDiceRoll(0, 0.9),
  5,
  'no track pieces should still allow non-6 outcomes',
)
assert.equal(
  getWeightedDiceRoll(2, 0.1),
  1,
  'normal rolls should stay uniform when pieces are on track',
)

const state = createGame({ mode: 1, piecesPerPlayer: 2 })
assert.equal(
  getPlayerTrackCount(state.players[0]),
  0,
  'fresh game should start with no track pieces',
)

const originalRandom = Math.random
Math.random = () => 0.9
try {
  const result = rollDice(state)
  assert.equal(result.rolled, true)
  assert.equal(
    result.skipped,
    true,
    'a non-6 launch roll with no movable pieces should be skipped',
  )
  assert.equal(
    result.advancePending,
    false,
    'the turn should advance immediately after a failed launch roll',
  )
  assert.equal(
    state.currentPlayerIndex,
    1,
    'turn should advance to the next player',
  )
  assert.equal(
    state.dice,
    null,
    'the failed roll should clear when the next turn starts',
  )

  const sixState = createGame({ mode: 1, piecesPerPlayer: 2 })
  sixState.dice = 6
  const launchPieceId = sixState.players[0].pieces[0].id
  const launchResult = movePiece(sixState, launchPieceId)
  assert.equal(
    launchResult.moved,
    true,
    'launching from base on 6 should move a piece',
  )
  assert.equal(
    sixState.currentPlayerIndex,
    0,
    'rolling 6 and launching should keep the current player on turn',
  )
  assert.equal(sixState.dice, null, 'launching should consume the dice result')

  Math.random = () => 0.1
  const extraRoll = rollDice(sixState)
  assert.equal(
    extraRoll.rolled,
    true,
    'the same player should be able to roll again after launching on 6',
  )
  assert.equal(
    sixState.currentPlayerIndex,
    0,
    'the extra roll should still belong to the same player',
  )
} finally {
  Math.random = originalRandom
}
