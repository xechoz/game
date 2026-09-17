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
import { useI18n } from './i18n'
import { type AppPage } from './composables/useFlightLudoPlayScene'
import {
  BOARD_PRESETS,
  DEFAULT_BOARD_PRESET_ID,
  type BoardPresetId,
  type GameMode,
} from './game'

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
const winnerColor = ref('#ef4444')

const { t } = useI18n()

// 开发环境专用的结果页预览入口（生产构建下整个按钮与逻辑会被 tree-shake）
const isDev = import.meta.env.DEV
const previewPlayers = [
  { key: 'red', color: '#ef4444' },
  { key: 'yellow', color: '#f59e0b' },
  { key: 'blue', color: '#3b82f6' },
  { key: 'green', color: '#22c55e' },
] as const

function showResultPreview() {
  const index = Math.floor(Math.random() * previewPlayers.length)
  const player = previewPlayers[index]
  winnerName.value = t(`${player.key}Player`)
  winnerColor.value = player.color
  winnerIndex.value = index
  page.value = 'result'
}

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
  winnerColor.value = nextWinner.color
  page.value = 'result'
}
</script>

<template>
  <main class="shell">
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
      :winner-color="winnerColor"
      @replay="replayGame"
      @prepare="goToPrepare"
    />

    <button
      v-if="isDev"
      class="dev-result-button"
      type="button"
      @click="showResultPreview"
    >
      {{ t('testResultButton') }}
    </button>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  padding: 0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    #57b7ff 0%,
    #8bd2ff 45%,
    #b9e4ff 72%,
    #fff1cf 100%
  );
}

.shell::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(
      circle 280px at 80% 8%,
      rgba(255, 224, 130, 0.55),
      transparent 70%
    ),
    radial-gradient(
      circle 380px at 10% 14%,
      rgba(239, 68, 68, 0.15),
      transparent 70%
    ),
    radial-gradient(
      circle 420px at 92% 26%,
      rgba(245, 158, 11, 0.16),
      transparent 70%
    ),
    radial-gradient(
      circle 440px at 8% 88%,
      rgba(59, 130, 246, 0.18),
      transparent 70%
    ),
    radial-gradient(
      circle 460px at 92% 86%,
      rgba(34, 197, 94, 0.15),
      transparent 70%
    );
}

.shell::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    radial-gradient(
      ellipse 300px 70px at 14% 16%,
      rgba(255, 255, 255, 0.72),
      transparent 70%
    ),
    radial-gradient(
      ellipse 200px 55px at 24% 19%,
      rgba(255, 255, 255, 0.5),
      transparent 70%
    ),
    radial-gradient(
      ellipse 340px 80px at 78% 30%,
      rgba(255, 255, 255, 0.6),
      transparent 70%
    ),
    radial-gradient(
      ellipse 220px 60px at 68% 33%,
      rgba(255, 255, 255, 0.42),
      transparent 70%
    ),
    radial-gradient(
      ellipse 260px 65px at 42% 72%,
      rgba(255, 255, 255, 0.38),
      transparent 70%
    ),
    radial-gradient(
      ellipse 420px 90px at 12% 84%,
      rgba(255, 255, 255, 0.4),
      transparent 70%
    ),
    radial-gradient(
      ellipse 300px 75px at 88% 66%,
      rgba(255, 255, 255, 0.34),
      transparent 70%
    ),
    radial-gradient(
      ellipse 220px 60px at 52% 40%,
      rgba(255, 255, 255, 0.3),
      transparent 70%
    );
  box-shadow:
    160px 200px 0 0 rgba(255, 255, 255, 0.8),
    420px 140px 0 1px rgba(255, 255, 255, 0.7),
    640px 260px 0 0 rgba(255, 255, 255, 0.75),
    880px 120px 0 0 rgba(255, 255, 255, 0.7),
    1100px 340px 0 1px rgba(255, 255, 255, 0.8),
    1340px 200px 0 0 rgba(255, 255, 255, 0.72),
    1560px 400px 0 0 rgba(255, 255, 255, 0.66),
    1800px 260px 0 1px rgba(255, 255, 255, 0.78),
    240px 560px 0 0 rgba(255, 255, 255, 0.6),
    760px 620px 0 0 rgba(255, 255, 255, 0.65),
    1280px 720px 0 0 rgba(255, 255, 255, 0.7),
    1720px 560px 0 1px rgba(255, 255, 255, 0.75);
  animation: shell-breathe 8s ease-in-out infinite alternate;
}

.dev-result-button {
  position: fixed;
  right: calc(14px + env(safe-area-inset-right));
  bottom: calc(14px + env(safe-area-inset-bottom));
  z-index: 40;
  padding: 9px 16px;
  border: 0;
  border-radius: 999px;
  background: rgba(13, 40, 78, 0.82);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  opacity: 0.82;
  box-shadow: 0 10px 24px rgba(13, 40, 78, 0.3);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.dev-result-button:hover {
  opacity: 1;
  transform: translateY(-1px);
}

@keyframes shell-breathe {
  from {
    opacity: 0.75;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shell::after {
    animation: none;
    opacity: 0.85;
  }
}
</style>
