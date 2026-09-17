<script setup lang="ts">
/**
 * 结果页：展示获胜玩家 + 再玩一次 / 返回准备页
 * 作为覆盖层叠加在游戏页之上（v-if 页面切到 result 时显示）
 */
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps<{
  winnerName: string
  winnerIndex: number
}>()

const emit = defineEmits<{
  (event: 'replay'): void
  (event: 'prepare'): void
}>()

const assetBase = import.meta.env.BASE_URL
const playerAvatarKeys = ['red', 'yellow', 'blue', 'green'] as const
const onceMoreButtonImage = `${assetBase}once_more_btn.png`
const closeButtonImage = `${assetBase}close_btn.png`
const winnerAvatar = computed(() => {
  const key = playerAvatarKeys[props.winnerIndex] ?? 'red'
  return `${assetBase}player-${key}.png`
})

const { t } = useI18n()
</script>

<template>
  <section class="page page-result">
    <div class="result-card glass-card" @click.stop>
      <div class="winner-hero">
        <img
          class="winner-plane"
          :src="winnerAvatar"
          :alt="t('winnerPlaneAlt', { winnerName: props.winnerName })"
        />
      </div>

      <div class="actions">
        <button
          class="action-button"
          type="button"
          :aria-label="t('onceMoreButton')"
          @click="emit('replay')"
        >
          <img :src="onceMoreButtonImage" :alt="t('onceMoreButton')" />
        </button>
        <button
          class="action-button"
          type="button"
          :aria-label="t('backButton')"
          @click="emit('prepare')"
        >
          <img :src="closeButtonImage" :alt="t('backButton')" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  width: 100%;
  margin: 0 auto;
  display: grid;
  gap: 14px;
  box-sizing: border-box;
}

.page-result {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.result-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: min(92%, 520px);
  max-width: 520px;
  aspect-ratio: 1 / 0.8;
  margin: 0;
  padding: 32px 24px 26px;
  min-height: 360px;
  background:
    radial-gradient(
      circle 300px at 50% 26%,
      rgba(255, 205, 90, 0.45),
      transparent 70%
    ),
    radial-gradient(
      circle 190px at 16% 16%,
      rgba(255, 224, 130, 0.3),
      transparent 70%
    ),
    radial-gradient(
      circle 190px at 84% 20%,
      rgba(255, 255, 255, 0.9),
      transparent 70%
    ),
    linear-gradient(165deg, #ffffff 0%, #fff3d7 100%);
  border-radius: 28px;
  box-shadow: 0 28px 70px rgba(41, 121, 196, 0.22);
  overflow: hidden;
}

.result-heading {
  text-align: center;
  padding-bottom: 12px;
}

.winner-hero {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 180px;
  margin: 12px auto 14px;
  padding: 0 8px;
}

.winner-plane {
  width: clamp(120px, 34vw, 180px);
  max-height: 180px;
  object-fit: contain;
  display: block;
}

.winner-tag {
  margin: 0;
  margin-bottom: 18px;
  text-align: center;
  color: #33527a;
  font-size: 1rem;
  opacity: 0.92;
}

.winner-tag strong {
  color: #17406f;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0 auto;
  max-width: 420px;
  margin-top: auto;
}

.action-button {
  border: 0;
  border-radius: 240px;
  background: rgba(41, 121, 196, 0.08);
  box-shadow: inset 0 0 0 1px rgba(41, 121, 196, 0.14);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
  display: grid;
  place-items: center;
}

.action-button img {
  width: min(100%, 120px);
  height: auto;
  display: block;
}

.action-button:hover {
  transform: translateY(-1px);
  background: rgba(41, 121, 196, 0.14);
  box-shadow:
    inset 0 0 0 1px rgba(41, 121, 196, 0.2),
    0 14px 28px rgba(41, 121, 196, 0.18);
}

.action-button:active {
  transform: translateY(0);
}
</style>
