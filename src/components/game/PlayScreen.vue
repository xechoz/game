<script setup lang="ts">
/**
 * 游戏页 UI 壳：canvas 挂载点（PIXI 渲染到此处）+ 顶栏（返回按钮 / 难度切换）
 * 通过 defineExpose 暴露 canvasEl 给上层 composable 使用
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

import { getBoardPreset, type BoardPresetId } from '../../game'

const props = defineProps<{
  boardPresetId: BoardPresetId
  gameActive: boolean
  hasRolledOnce: boolean
}>()

const assetBase = import.meta.env.BASE_URL
const backButtonImage = `${assetBase}ui/back-button.png`
const canvasEl = ref<HTMLDivElement | null>(null)

defineExpose({ canvasEl })

const emit = defineEmits({
  back: null,
  'winner-change': null,
  'update:board-preset-id': null,
})

const { t } = useI18n()

const difficultyOptions = computed(() => [
  {
    value: 'tiny-3' as const,
    title: t('quickMode'),
    hint: t('stepsPerEdge', { steps: getBoardPreset('tiny-3').stepsPerEdge }),
    image: `${assetBase}difficulty/moon-1.png`,
  },
  {
    value: 'normal-5' as const,
    title: t('normalMode'),
    hint: t('stepsPerEdge', { steps: getBoardPreset('normal-5').stepsPerEdge }),
    image: `${assetBase}difficulty/moon-2.png`,
  },
  {
    value: 'hell-7' as const,
    title: t('hellMode'),
    hint: t('stepsPerEdge', { steps: getBoardPreset('hell-7').stepsPerEdge }),
    image: `${assetBase}difficulty/moon-3.png`,
  },
])

const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

// 顶栏防误触：对局进行中顶栏默认半透明锁定，点击顶栏区域唤醒，
// 唤醒后有固定 10s 窗口（操作不延长），超时自动回到锁定态；
// 首次掷骰或对局重开/结束时立即回锁
const TOPBAR_ACTIVE_TIMEOUT_MS = 10_000
const topbarActive = ref(false)
let topbarActiveTimer: ReturnType<typeof setTimeout> | undefined
const topbarLocked = computed(() => props.gameActive && !topbarActive.value)

function wakeTopbar() {
  if (!props.gameActive || topbarActive.value) return
  topbarActive.value = true
  topbarActiveTimer = setTimeout(() => {
    topbarActive.value = false
  }, TOPBAR_ACTIVE_TIMEOUT_MS)
}

watch(
  () => [props.gameActive, props.hasRolledOnce] as const,
  () => {
    topbarActive.value = false
    clearTimeout(topbarActiveTimer)
  },
)

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  clearTimeout(topbarActiveTimer)
})

function showToast(message: string) {
  toastMessage.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 2500)
}

function handleDifficultyChange(
  option: (typeof difficultyOptions.value)[number],
) {
  if (props.boardPresetId === option.value) return
  emit('update:board-preset-id', option.value)
  showToast(t('difficultyChanged', { name: option.title }))
}
</script>

<template>
  <section class="page page-play">
    <div class="grid play-grid">
      <div
        class="play-topbar"
        :class="{ 'topbar-locked': topbarLocked }"
      >
        <div
          class="play-controls-row"
          :title="topbarLocked ? t('topbarLockedHint') : undefined"
          @click="wakeTopbar"
        >
          <button
            class="circle-action secondary back-action"
            type="button"
            :aria-label="t('backToPrepare')"
            :aria-disabled="topbarLocked"
            @click="emit('back')"
          >
            <img class="back-icon" :src="backButtonImage" alt="" />
          </button>
          <div class="board-preset-row" :aria-label="t('difficultyMode')">
            <button
              v-for="option in difficultyOptions"
              :key="option.value"
              type="button"
              class="preset-pill"
              :class="{ active: props.boardPresetId === option.value }"
              :title="`${option.title} · ${option.hint}`"
              :aria-label="`${option.title} · ${option.hint}`"
              :aria-pressed="props.boardPresetId === option.value"
              :aria-disabled="topbarLocked"
              @click="handleDifficultyChange(option)"
            >
              <img
                class="preset-image"
                :src="option.image"
                :alt="option.title"
              />
              <span
                v-if="props.boardPresetId === option.value"
                class="preset-check"
                aria-hidden="true"
                >✓</span
              >
            </button>
          </div>
          <div class="play-controls-spacer" aria-hidden="true"></div>
        </div>
        <transition name="toast">
          <div v-if="toastMessage" class="difficulty-toast" role="status">
            {{ toastMessage }}
          </div>
        </transition>
      </div>
      <div class="play-stage">
        <section
          ref="canvasEl"
          class="canvas-shell play-canvas-shell"
          :aria-label="t('rollCanvas')"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  width: min(920px, calc(100% - 20px));
  margin: 0 auto;
  display: grid;
  gap: 14px;
}

.page.page-play {
  width: min(920px, calc(100% - 20px));
  min-height: 100dvh;
  padding: 18px 0 22px;
  align-content: center;
  justify-items: center;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: transparent;
  box-sizing: border-box;
}

.play-grid {
  --play-canvas-width: min(
    100%,
    760px,
    calc(100dvw - 20px),
    calc((100dvh - 128px) / 1.5)
  );
  display: grid;
  gap: 14px;
  place-items: center;
  position: relative;
  width: 100%;
  max-width: 760px;
  z-index: 1;
}

.play-topbar {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: min(100%, var(--play-canvas-width));
  z-index: 3;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.play-topbar.topbar-locked {
  opacity: 0.45;
}

.play-topbar.topbar-locked button {
  pointer-events: none;
}

.play-controls-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  width: 100%;
  pointer-events: auto;
}

.play-stage {
  position: relative;
  width: var(--play-canvas-width);
  aspect-ratio: 2 / 3;
}

.play-controls-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  width: 100%;
  pointer-events: auto;
}

.play-controls-spacer {
  width: 56px;
  height: 40px;
}

.difficulty-toast {
  position: absolute;
  top: 62px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: 9px 18px;
  border-radius: 999px;
  background: rgba(13, 40, 78, 0.9);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 12px 26px rgba(13, 40, 78, 0.35);
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

.back-action {
  width: 56px;
  height: 40px;
  padding: 6px 10px;
  border-radius: 14px;
  overflow: visible;
  background: transparent;
  border: none;
  box-shadow: none;
}

.back-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.board-preset-row {
  display: grid;
  grid-template-columns: repeat(3, 50px);
  grid-auto-rows: 50px;
  justify-content: center;
  justify-self: center;
  gap: 8px;
}

.preset-pill {
  position: relative;
  width: 50px;
  height: 50px;
  min-height: 50px;
  border: none;
  border-radius: 14px;
  padding: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.85);
  box-shadow:
    0 8px 18px rgba(41, 121, 196, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.preset-pill:hover {
  box-shadow:
    0 10px 22px rgba(41, 121, 196, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.preset-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  z-index: 1;
}

.preset-pill.active {
  overflow: visible;
  background: linear-gradient(180deg, #7fc4ff, #57b7ff);
  box-shadow:
    0 10px 22px rgba(47, 127, 242, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.preset-check {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  color: #2f7ff2;
  background: #fff;
  box-shadow: 0 2px 8px rgba(47, 127, 242, 0.4);
  z-index: 2;
}

.play-canvas-shell {
  min-height: 0;
}

.circle-action {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 1.15rem;
  line-height: 1;
}

.canvas-shell {
  border: none;
  border-radius: 22px;
  background: transparent;
  box-shadow:
    0 30px 80px rgba(41, 121, 196, 0.28),
    0 0 0 1px rgba(255, 255, 255, 0.4);
  backdrop-filter: none;
  width: 100%;
  height: 100%;
  max-height: none;
  overflow: visible;
}

.canvas-shell :deep(canvas) {
  display: block;
}

@media (max-width: 859px) {
  .page.page-play {
    width: min(100%, calc(100% - 12px));
    min-height: 100dvh;
    padding: 10px 0 14px;
  }

  .play-grid {
    --play-canvas-width: min(calc(100dvw - 12px), calc((100dvh - 110px) / 1.5));
    max-width: 100%;
    gap: 12px;
  }

  .canvas-shell {
    min-height: unset;
    max-height: none;
    aspect-ratio: auto;
  }

  .board-preset-row {
    gap: 6px;
  }

  .preset-pill {
    width: 50px;
    height: 50px;
    min-height: 50px;
    border-radius: 14px;
  }

  .circle-action {
    width: 40px;
    height: 40px;
  }

  .play-controls-spacer {
    width: 56px;
    height: 40px;
  }
}
</style>
