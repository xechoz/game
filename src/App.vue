<script setup lang="ts">
/**
 * 应用根组件：页面路由（prepare → play → result）
 *
 * - 维护全局配置（mode / piecesPerPlayer / boardPresetId / autoPlayMode）
 * - 通过 v-if 在三个页面组件间切换；play 与 result 使用 defineAsyncComponent 懒加载
 * - PlayPage 复用同一份场景（result 页叠加在其上），保证背后棋盘不闪烁
 */
import { defineAsyncComponent, ref } from 'vue'

import PrepareScreen from './components/game/PrepareScreen.vue'
import { type AppPage } from './composables/useFlightLudoPlayScene'
import {
  BOARD_PRESETS,
  DEFAULT_BOARD_PRESET_ID,
  type BoardPresetId,
  type GameMode,
} from './game'

const assetBase = import.meta.env.BASE_URL
const appBg = `${assetBase}prepare-bg.png`
const presetStorageKey = 'flightLudo.boardPreset'

function loadSavedPreset(): BoardPresetId {
  const saved = localStorage.getItem(presetStorageKey)
  if (saved && saved in BOARD_PRESETS) {
    return saved as BoardPresetId
  }
  return DEFAULT_BOARD_PRESET_ID
}

// 懒加载（分包）：PlayScreen.Content 与 ResultScreen 只在实际进入时下载
const loadResultScreen = () => import('./components/game/ResultScreen.vue')
const loadPlayPage = () => import('./components/game/PlayScreen.Content.vue')

const ResultScreen = defineAsyncComponent(loadResultScreen)
const PlayPage = defineAsyncComponent(loadPlayPage)

// 全局配置与页面状态
const mode = ref<GameMode>(1)
const piecesPerPlayer = ref(4)
const boardPresetId = ref<BoardPresetId>(loadSavedPreset())
const page = ref<AppPage>('prepare')
const autoPlayMode = ref(true)
const winnerName = ref('')
const winnerIndex = ref(0)

// 准备页点击开始：预加载 play 分包后再切页，避免白屏
async function startGame() {
  await loadPlayPage()
  page.value = 'play'
}

function goToPrepare() {
  page.value = 'prepare'
}

// 结果页"再玩一次"：直接切回 play（复用已就绪的 PIXI 场景，内部会重开一局）
function replayGame() {
  page.value = 'play'
}

function setMode(nextMode: GameMode) {
  mode.value = nextMode
}

function setPiecesPerPlayer(nextCount: number) {
  piecesPerPlayer.value = nextCount
}

function setBoardPresetId(nextBoardPresetId: BoardPresetId) {
  boardPresetId.value = nextBoardPresetId
  localStorage.setItem(presetStorageKey, nextBoardPresetId)
}

// 对局出现胜利者：记录获胜信息并切到结果页
function handleWinnerChange(nextWinner: {
  name: string
  color: string
  index: number
}) {
  winnerName.value = nextWinner.name
  winnerIndex.value = nextWinner.index
  page.value = 'result'
}
</script>

<template>
  <main class="shell">
    <img class="app-bg" :src="appBg" alt="" aria-hidden="true" />

    <PrepareScreen
      v-if="page === 'prepare'"
      :mode="mode"
      :pieces-per-player="piecesPerPlayer"
      @update:mode="setMode"
      @update:pieces-per-player="setPiecesPerPlayer"
      @start="startGame"
    />

    <PlayPage
      v-else-if="page === 'play' || page === 'result'"
      :mode="mode"
      :pieces-per-player="piecesPerPlayer"
      :board-preset-id="boardPresetId"
      :auto-play-mode="autoPlayMode"
      @back="goToPrepare"
      @winner-change="handleWinnerChange"
      @update:board-preset-id="setBoardPresetId"
    />

    <ResultScreen
      v-if="page === 'result'"
      :winner-name="winnerName"
      :winner-index="winnerIndex"
      @replay="replayGame"
      @prepare="goToPrepare"
    />
  </main>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  padding: 0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: none;
}

.app-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(14px);
  transform: scale(1.04);
  z-index: -2;
  pointer-events: none;
}
</style>
