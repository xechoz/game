<script setup lang="ts">
/**
 * 结果页：展示获胜玩家 + 再玩一次 / 返回准备页
 * 作为覆盖层叠加在游戏页之上（v-if 页面切到 result 时显示）
 *
 * 视觉主题由 winnerColor 驱动（--winner-color），主 CTA 绑定胜者配色；
 * 打开时聚焦主按钮，保证键盘 / 读屏用户能立即操作。
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps<{
  winnerName: string
  winnerIndex: number
  winnerColor: string
}>()

const emit = defineEmits<{
  (event: 'replay'): void
  (event: 'prepare'): void
}>()

const assetBase = import.meta.env.BASE_URL
const playerAvatarKeys = ['red', 'yellow', 'blue', 'green'] as const
const onceMoreButtonImage = `${assetBase}once_more_btn.png`
const closeButtonImage = `${assetBase}close_btn.png`
const victoryImage = `${assetBase}victory.png`
const titleId = 'result-dialog-title'

const winnerAvatar = computed(() => {
  const key = playerAvatarKeys[props.winnerIndex] ?? 'red'
  return `${assetBase}player-${key}.png`
})

// 装饰性彩带：用索引推导位置/延迟，保证每次渲染稳定，避免随机抖动
const confettiPalette = ['#ffd34d', '#ff8a5c', '#7fc4ff', '#6be08a', '#ffffff']
const confettiPieces = computed(() =>
  Array.from({ length: 18 }, (_, i) => ({
    key: i,
    left: (i * 37) % 100,
    delay: (((i * 53) % 100) / 100) * 2.2,
    duration: 2.8 + (((i * 29) % 100) / 100) * 2,
    drift: (((i * 17) % 100) - 50) / 8,
    rotate: ((i * 47) % 360) - 180,
    size: 6 + ((i * 13) % 7),
    color: confettiPalette[i % confettiPalette.length],
  })),
)

const primaryButton = ref<HTMLButtonElement | null>(null)

const { t } = useI18n()

onMounted(() => {
  primaryButton.value?.focus({ preventScroll: true })
})
</script>

<template>
  <section class="result-overlay">
    <div
      class="result-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :style="{ '--winner-color': props.winnerColor }"
    >
      <div class="celebration" aria-hidden="true">
        <span
          v-for="piece in confettiPieces"
          :key="piece.key"
          class="confetti"
          :style="{
            left: `${piece.left}%`,
            width: `${piece.size}px`,
            height: `${piece.size * 1.6}px`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            '--drift': `${piece.drift}vw`,
            '--spin': `${piece.rotate}deg`,
          }"
        />
      </div>

      <div class="result-hero">
        <img
          class="victory-badge"
          :src="victoryImage"
          alt=""
          aria-hidden="true"
        />
        <div class="plane-halo">
          <img
            class="winner-plane"
            :src="winnerAvatar"
            :alt="t('winnerPlaneAlt', { winnerName: props.winnerName })"
          />
        </div>
      </div>

      <div class="result-copy">
        <p class="result-label">{{ t('resultDialogLabel') }}</p>
        <h2 :id="titleId" class="result-title">{{ t('victoryTitle') }}</h2>
        <p class="result-subtitle">
          {{ t('winnerAnnouncement', { winnerName: props.winnerName }) }}
        </p>
      </div>

      <div class="result-actions">
        <button
          ref="primaryButton"
          class="result-button primary"
          type="button"
          @click="emit('replay')"
        >
          <img :src="onceMoreButtonImage" alt="" aria-hidden="true" />
          <span>{{ t('onceMoreButton') }}</span>
        </button>
        <button
          class="result-button secondary"
          type="button"
          @click="emit('prepare')"
        >
          <img :src="closeButtonImage" alt="" aria-hidden="true" />
          <span>{{ t('backToPrepare') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.result-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: calc(20px + env(safe-area-inset-top)) 20px
    calc(20px + env(safe-area-inset-bottom));
  background: rgba(13, 40, 78, 0.48);
  backdrop-filter: blur(10px);
  pointer-events: auto;
  animation: overlay-in 0.28s ease both;
}

.result-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(92%, 440px);
  padding: 40px 26px 28px;
  border-radius: 32px;
  border: 2px solid color-mix(in srgb, var(--winner-color) 45%, #ffffff);
  background:
    radial-gradient(
      circle 240px at 50% 0%,
      color-mix(in srgb, var(--winner-color) 20%, transparent),
      transparent 68%
    ),
    linear-gradient(180deg, #ffffff 0%, #eef6ff 100%);
  box-shadow:
    0 30px 70px rgba(6, 26, 54, 0.4),
    0 2px 0 rgba(255, 255, 255, 0.8) inset;
  overflow: hidden;
  animation: dialog-in 0.42s cubic-bezier(0.22, 1.1, 0.36, 1) both;
}

.result-dialog::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--winner-color),
    transparent
  );
}

.celebration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.confetti {
  position: absolute;
  top: -12%;
  border-radius: 3px;
  opacity: 0.9;
  animation-name: confetti-fall;
  animation-timing-function: ease-in;
  animation-iteration-count: infinite;
}

.result-hero {
  position: relative;
  display: grid;
  place-items: center;
  width: 220px;
  height: 190px;
  margin-bottom: 6px;
}

.victory-badge {
  position: absolute;
  top: -14px;
  width: 132px;
  height: 132px;
  object-fit: contain;
  opacity: 0.95;
  animation: badge-in 0.5s ease 0.1s both;
}

.plane-halo {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 150px;
  height: 150px;
  margin-top: 24px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--winner-color) 45%, #ffffff),
    transparent 68%
  );
  animation: plane-float 3s ease-in-out infinite;
}

.winner-plane {
  width: 118px;
  height: 118px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 12px 18px rgba(13, 40, 78, 0.28));
}

.result-copy {
  text-align: center;
  margin-bottom: 24px;
}

.result-label {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(51, 82, 122, 0.7);
}

.result-title {
  margin: 0;
  font-size: clamp(2rem, 8vw, 2.6rem);
  font-weight: 900;
  line-height: 1.1;
  color: color-mix(in srgb, var(--winner-color) 72%, #12324f);
  text-shadow: 0 3px 0 rgba(255, 255, 255, 0.7);
}

.result-subtitle {
  margin: 8px 0 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #33527a;
}

.result-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 340px;
}

.result-button {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-height: 88px;
  padding: 12px 8px;
  border: 0;
  border-radius: 22px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.result-button img {
  width: 46px;
  height: 46px;
  object-fit: contain;
  display: block;
}

.result-button.primary {
  color: #fff;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--winner-color) 88%, white),
    color-mix(in srgb, var(--winner-color) 82%, black)
  );
  box-shadow: 0 14px 26px
    color-mix(in srgb, var(--winner-color) 36%, transparent);
}

.result-button.secondary {
  color: #33527a;
  background: rgba(41, 121, 196, 0.08);
  box-shadow: inset 0 0 0 1px rgba(41, 121, 196, 0.16);
}

.result-button:hover {
  transform: translateY(-1px);
}

.result-button:active {
  transform: translateY(0) scale(0.98);
}

.result-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--winner-color) 70%, white);
  outline-offset: 2px;
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes badge-in {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(0.8);
  }
  to {
    opacity: 0.95;
    transform: translateY(0) scale(1);
  }
}

@keyframes plane-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes confetti-fall {
  0% {
    transform: translate3d(0, 0, 0) rotate(0deg);
    opacity: 0;
  }
  12% {
    opacity: 0.95;
  }
  100% {
    transform: translate3d(var(--drift), 340px, 0) rotate(var(--spin));
    opacity: 0;
  }
}

@media (max-width: 420px) {
  .result-dialog {
    padding: 34px 18px 22px;
    border-radius: 26px;
  }

  .result-hero {
    width: 190px;
    height: 166px;
  }

  .result-button {
    min-height: 78px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .result-overlay,
  .result-dialog,
  .victory-badge,
  .plane-halo,
  .confetti {
    animation: none;
  }

  .confetti {
    display: none;
  }
}
</style>
