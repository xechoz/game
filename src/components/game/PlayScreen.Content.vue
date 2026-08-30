<script setup lang="ts">
/**
 * 游戏页内容壳（懒加载入口）
 *
 * 职责：
 * - 挂载 useFlightLudoPlayScene 总调度（PIXI 场景生命周期在这里管理）
 * - 监听 winner 变化，向 App.vue 冒泡 winner-change 事件切换结果页
 * - 向下渲染 PlayScreen.vue（canvas 宿主 + 顶栏控件）
 *
 * 注意：本组件必须保持挂载（v-else-if 下页面在 play 时会保留），
 * 结果页只是叠加在其上的覆盖层，离开时由 App.vue 的 v-if 卸载并触发资源清理。
 */
import { onMounted, ref, watch, toRef } from 'vue'
import { useI18n } from '../../i18n'

import PlayScreen from './PlayScreen.vue'
import {
  type AppPage,
  useFlightLudoPlayScene,
} from '../../composables/useFlightLudoPlayScene'
import { type BoardPresetId, type GameMode } from '../../game'

const props = defineProps<{
  mode: GameMode
  piecesPerPlayer: number
  boardPresetId: BoardPresetId
  autoPlayMode: boolean
}>()

const emit = defineEmits({
  back: null,
  'winner-change': null,
  'update:board-preset-id': null,
})

const page = ref<AppPage>('play')
const playScreenRef = ref<{ canvasEl: HTMLDivElement | null } | null>(null)

const { t } = useI18n()

// 接线总调度：props 通过 toRef 保持响应式，页面切换/配置变化都能驱动重开
const { winner, startGame, goToPrepare } = useFlightLudoPlayScene({
  page,
  mode: toRef(props, 'mode'),
  piecesPerPlayer: toRef(props, 'piecesPerPlayer'),
  boardPresetId: toRef(props, 'boardPresetId'),
  autoPlayMode: toRef(props, 'autoPlayMode'),
  playScreenRef,
})

// 胜利者出现 → 通知父级（App.vue）切到结果页
watch(
  () => winner.value,
  (player) => {
    if (player) {
      emit('winner-change', {
        name: t(`${player.name}Player`),
        color: player.color,
        index: player.index,
      })
    }
  },
  { immediate: true },
)

function handleBack() {
  goToPrepare()
  emit('back')
}

function handleBoardPresetId(nextBoardPresetId: BoardPresetId) {
  emit('update:board-preset-id', nextBoardPresetId)
}

onMounted(() => {
  void startGame()
})
</script>

<template>
  <PlayScreen
    ref="playScreenRef"
    :board-preset-id="boardPresetId"
    @back="handleBack"
    @winner-change="emit('winner-change', $event)"
    @update:board-preset-id="handleBoardPresetId"
  />
</template>
