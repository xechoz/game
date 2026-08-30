<script setup lang="ts">
/**
 * 准备页：选择玩家人数（1~4P）开始对局
 * 点击任意模式卡片即启动游戏（同时解锁 BGM 播放）
 */
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { createSceneAudio } from '../../composables/flight-ludo-play-scene/sceneAudio'

const props = defineProps<{
  mode: 1 | 2 | 3 | 4
  piecesPerPlayer: number
}>()

const emit = defineEmits<{
  (event: 'update:mode', value: 1 | 2 | 3 | 4): void
  (event: 'update:pieces-per-player', value: number): void
  (event: 'start'): void
  (event: 'reset'): void
}>()

const assetBase = import.meta.env.BASE_URL
const { t } = useI18n()
const { startBackgroundMusic } = createSceneAudio(
  (name) => `${assetBase}${name}`,
)

function selectMode(value: 1 | 2 | 3 | 4) {
  startBackgroundMusic()
  emit('update:mode', value)
  emit('start')
}

const playerAvatarSources = [
  { src: `${assetBase}player-red.png`, key: 'red' },
  { src: `${assetBase}player-blue.png`, key: 'blue' },
  { src: `${assetBase}player-green.png`, key: 'green' },
  { src: `${assetBase}player-yellow.png`, key: 'yellow' },
]

const playerAvatars = computed(() =>
  playerAvatarSources.map((item) => ({
    src: item.src,
    alt: t(`${item.key}PlayerAvatarAlt`),
  })),
)

const modeOptions = computed(() => [
  {
    value: 1 as const,
    avatars: playerAvatars.value.slice(0, 1),
    accent: '#ffb347',
  },
  {
    value: 2 as const,
    avatars: playerAvatars.value.slice(0, 2),
    accent: '#5f9cff',
  },
  {
    value: 3 as const,
    avatars: playerAvatars.value.slice(0, 3),
    accent: '#56d38f',
  },
  {
    value: 4 as const,
    avatars: playerAvatars.value.slice(0, 4),
    accent: '#f56f7f',
  },
])
</script>

<template>
  <section class="page page-prepare">
    <div class="bg-decor" aria-hidden="true">
      <span class="dec-orbit orbit-a"></span>
      <span class="dec-orbit orbit-b"></span>
      <span class="dec-cloud cloud-a"></span>
      <span class="dec-cloud cloud-b"></span>
      <span class="dec-dot dot-a"></span>
      <span class="dec-dot dot-b"></span>
      <span class="dec-dot dot-c"></span>
    </div>
    <div class="mode-shell">
      <div class="mode-grid">
        <button
          v-for="option in modeOptions"
          :key="option.value"
          :class="[
            'select-card',
            `card-${option.avatars.length}`,
            { active: props.mode === option.value },
          ]"
          type="button"
          :aria-label="t('playerMode', { count: option.value })"
          :style="{ '--accent': option.accent }"
          @click="selectMode(option.value)"
        >
          <div class="card-topbar"></div>
          <div class="card-glow"></div>
          <div class="card-board"></div>
          <div class="card-route"></div>
          <div class="card-corners" aria-hidden="true">
            <span class="corner corner-a"></span>
            <span class="corner corner-b"></span>
            <span class="corner corner-c"></span>
            <span class="corner corner-d"></span>
          </div>
          <div class="avatar-stack" :class="`stack-${option.avatars.length}`">
            <img
              v-for="avatar in option.avatars"
              :key="avatar.src"
              class="avatar-icon"
              :src="avatar.src"
              :alt="avatar.alt"
            />
          </div>
          <div class="card-footer">
            <span class="mode-badge">{{ option.value }}P</span>
          </div>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  width: min(920px, calc(100% - 12px));
  min-height: 100dvh;
  margin: 0 auto;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 16px;
  position: relative;
  isolation: isolate;
  background: none;
  overflow: hidden;
  box-sizing: border-box;
}

.bg-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.dec-orbit,
.dec-cloud,
.dec-dot {
  position: absolute;
  border-radius: 999px;
}

.dec-orbit {
  border: 2px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 0 40px rgba(255, 255, 255, 0.05);
}

.orbit-a {
  width: 420px;
  height: 420px;
  top: -100px;
  left: -120px;
}

.orbit-b {
  width: 520px;
  height: 520px;
  right: -190px;
  bottom: -150px;
}

.dec-cloud {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.22),
    rgba(255, 255, 255, 0.04) 70%,
    transparent 72%
  );
  filter: blur(2px);
}

.cloud-a {
  width: 240px;
  height: 110px;
  top: 10%;
  left: 4%;
}

.cloud-b {
  width: 300px;
  height: 140px;
  right: 6%;
  top: 14%;
}

.dec-dot {
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.4);
}

.dot-a {
  top: 18%;
  left: 18%;
}
.dot-b {
  top: 66%;
  left: 10%;
}
.dot-c {
  top: 72%;
  right: 14%;
}

.mode-shell {
  position: relative;
  z-index: 1;
  width: min(980px, calc(100% - 12px));
  margin: 0 auto;
  padding: 16px;
  border-radius: 32px;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.24),
      rgba(255, 255, 255, 0.08)
    ),
    rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    0 26px 72px rgba(0, 49, 104, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(8px);
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

.mode-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.select-card {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 30px;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.42),
      rgba(255, 255, 255, 0.16)
    ),
    rgba(255, 255, 255, 0.12);
  color: rgba(0, 0, 0, 0.95);
  cursor: pointer;
  min-height: 206px;
  padding: 12px 12px 46px;
  display: grid;
  align-items: center;
  justify-items: center;
  position: relative;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
  touch-action: manipulation;
  box-shadow:
    0 14px 28px rgba(0, 31, 61, 0.14),
    0 2px 8px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(6px);
}

.select-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at 20% 18%,
      rgba(255, 255, 255, 0.42),
      transparent 20%
    ),
    radial-gradient(
      circle at 80% 18%,
      rgba(255, 255, 255, 0.34),
      transparent 18%
    ),
    radial-gradient(
      circle at 50% 76%,
      rgba(255, 255, 255, 0.18),
      transparent 42%
    );
  pointer-events: none;
}

.select-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      135deg,
      transparent 0 18%,
      rgba(255, 255, 255, 0.2) 18% 19%,
      transparent 19% 100%
    ),
    linear-gradient(
      315deg,
      transparent 0 18%,
      rgba(255, 255, 255, 0.18) 18% 19%,
      transparent 19% 100%
    );
  pointer-events: none;
  opacity: 0.9;
}

.card-topbar,
.card-board,
.card-route,
.card-corners,
.card-footer,
.card-glow {
  position: absolute;
  pointer-events: none;
}

.card-topbar {
  top: 0;
  left: 0;
  right: 0;
  height: 16px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 88%, white),
    transparent
  );
  opacity: 0.9;
}

.card-board {
  inset: 14px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background:
    radial-gradient(
      circle at center,
      rgba(255, 255, 255, 0.14),
      transparent 56%
    ),
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.06),
      rgba(255, 255, 255, 0.02)
    );
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.card-route {
  inset: 31% 16% 26%;
  border-radius: 20px;
  border: 2px dashed rgba(255, 255, 255, 0.42);
  opacity: 0.8;
}

.card-corners {
  inset: 18px;
}

.corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 80%, white);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.18);
}

.corner-a {
  top: 0;
  left: 0;
}
.corner-b {
  top: 0;
  right: 0;
}
.corner-c {
  bottom: 0;
  left: 0;
}
.corner-d {
  bottom: 0;
  right: 0;
}

.mode-badge {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 900;
  color: #fff;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 92%, white),
    color-mix(in srgb, var(--accent) 78%, black)
  );
  box-shadow: 0 10px 20px color-mix(in srgb, var(--accent) 22%, transparent);
}

.card-footer {
  left: 0;
  right: 0;
  bottom: 12px;
  display: grid;
  place-items: center;
  z-index: 2;
}

.card-glow {
  inset: 14px;
  border-radius: 24px;
  background:
    radial-gradient(
      circle at center,
      color-mix(in srgb, var(--accent) 24%, transparent),
      transparent 58%
    ),
    radial-gradient(
      circle at 50% 36%,
      rgba(255, 255, 255, 0.12),
      transparent 42%
    );
  opacity: 0;
  transition: opacity 0.18s ease;
}

.select-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent) 58%, white);
  box-shadow:
    0 18px 34px rgba(0, 67, 134, 0.14),
    0 3px 10px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.select-card.active {
  border-color: color-mix(in srgb, var(--accent) 62%, white);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.15) inset,
    0 22px 42px color-mix(in srgb, var(--accent) 20%, rgba(0, 117, 222, 0.12)),
    0 12px 20px rgba(0, 31, 61, 0.08);
  filter: saturate(1.08);
}

.select-card.active .card-glow {
  opacity: 1;
}

.select-card.active::after {
  content: '';
}

.avatar-stack {
  position: relative;
  width: min(74%, 160px);
  aspect-ratio: 1;
  min-height: 0;
  margin: 0 auto;
  z-index: 1;
}

.avatar-icon {
  position: absolute;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 0;
  box-shadow: none;
  background: transparent;
  transform: translate(-50%, -50%);
}

.avatar-stack.stack-1 .avatar-icon {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(1.18);
}

.avatar-stack.stack-2 .avatar-icon:first-child {
  top: 50%;
  left: 34%;
}

.avatar-stack.stack-2 .avatar-icon:last-child {
  top: 50%;
  left: 66%;
}

.avatar-stack.stack-3 .avatar-icon:nth-child(1) {
  top: 28%;
  left: 50%;
}

.avatar-stack.stack-3 .avatar-icon:nth-child(2) {
  top: 74%;
  left: 28%;
}

.avatar-stack.stack-3 .avatar-icon:nth-child(3) {
  top: 74%;
  left: 72%;
}

.avatar-stack.stack-4 .avatar-icon:nth-child(1) {
  top: 28%;
  left: 28%;
}

.avatar-stack.stack-4 .avatar-icon:nth-child(2) {
  top: 28%;
  left: 72%;
}

.avatar-stack.stack-4 .avatar-icon:nth-child(3) {
  top: 72%;
  left: 28%;
}

.avatar-stack.stack-4 .avatar-icon:nth-child(4) {
  top: 72%;
  left: 72%;
}

@media (max-width: 540px) {
  .page {
    width: min(100%, calc(100% - 8px));
    gap: 12px;
  }

  .mode-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .mode-shell {
    width: min(100%, calc(100% - 8px));
    padding: 12px;
    border-radius: 26px;
  }

  .select-card {
    min-height: 174px;
    padding: 10px 10px 40px;
    border-radius: 24px;
  }

  .card-topbar {
    height: 14px;
  }

  .card-board {
    inset: 12px;
  }

  .card-route {
    inset: 33% 15% 27%;
  }

  .mode-badge {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    font-size: 13px;
  }

  .card-footer {
    bottom: 10px;
  }

  .avatar-icon {
    width: 62px;
    height: 62px;
  }
}
</style>
