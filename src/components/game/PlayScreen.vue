<script setup lang="ts">
/**
 * 游戏页 UI 壳：canvas 挂载点（PIXI 渲染到此处）+ 顶栏（返回按钮 / 难度切换）
 * 通过 defineExpose 暴露 canvasEl 给上层 composable 使用
 */
import { computed, ref } from 'vue'
import { useI18n } from '../../i18n'

import { getBoardPreset, type BoardPresetId } from '../../game'

const props = defineProps<{
  boardPresetId: BoardPresetId
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
    accent: '#ffb347',
    image: `${assetBase}difficulty/quick-mode.png`,
  },
  {
    value: 'normal-5' as const,
    title: t('normalMode'),
    hint: t('stepsPerEdge', { steps: getBoardPreset('normal-5').stepsPerEdge }),
    accent: '#5f9cff',
    image: `${assetBase}difficulty/normal-mode.png`,
  },
  {
    value: 'hell-7' as const,
    title: t('hellMode'),
    hint: t('stepsPerEdge', { steps: getBoardPreset('hell-7').stepsPerEdge }),
    accent: '#ef4444',
    image: `${assetBase}difficulty/hell-mode.png`,
  },
])
</script>

<template>
  <section class="page page-play">
    <div class="grid play-grid">
      <div class="play-topbar">
        <div class="play-controls-row">
          <button
            class="circle-action secondary back-action"
            type="button"
            :aria-label="t('backToPrepare')"
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
              :style="{ '--accent': option.accent }"
              :aria-label="option.title"
              @click="emit('update:board-preset-id', option.value)"
            >
              <img
                class="preset-image"
                :src="option.image"
                :alt="option.title"
              />
              <span class="sr-only">{{ option.title }}</span>
            </button>
          </div>
          <div class="play-controls-spacer" aria-hidden="true"></div>
        </div>
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
    calc((100dvh - 212px) / 1.5)
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
  position: static;
  width: min(100%, var(--play-canvas-width));
  z-index: 3;
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
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  padding: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.85);
  box-shadow:
    0 8px 18px rgba(41, 121, 196, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.preset-image {
  position: absolute;
  inset: 4px;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  object-fit: cover;
  border-radius: 10px;
  display: block;
  pointer-events: none;
  z-index: 1;
}

.preset-pill::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(6, 18, 36, 0.03), rgba(6, 18, 36, 0.1)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.preset-pill::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 10px;
  background:
    radial-gradient(
      circle at 50% 22%,
      rgba(255, 255, 255, 0.24),
      transparent 30%
    ),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 55%);
  pointer-events: none;
}

.preset-pill.active {
  border-color: color-mix(in srgb, var(--accent) 62%, white);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.15) inset,
    0 10px 18px color-mix(in srgb, var(--accent) 16%, rgba(0, 117, 222, 0.1));
  transform: translateY(-1px);
}

.preset-pill.active::before {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
    --play-canvas-width: min(calc(100dvw - 12px), calc((100dvh - 176px) / 1.5));
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

  .preset-pill::before,
  .preset-pill::after {
    inset: 4px;
    border-radius: 10px;
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
