/**
 * 场景音效（sceneAudio）
 *
 * 模块级单例资源（AudioContext / BGM / 播放中的音效集合），
 * createSceneAudio 返回一组可用的音效 API：
 *  - BGM：HTMLAudioElement 循环播放（低音量）
 *  - 短音效：HTMLAudioElement 播放，加载/播放失败时降级为 Web Audio 合成的提示音
 *  - 音调音效（摇骰/移动/胜利）：直接由 Web Audio API 合成，无需素材文件
 *
 * 注意：音频播放需用户手势后才能生效（浏览器自动播放策略），
 * 因此 prepare 页点击选模式时会调用 startBackgroundMusic 解锁。
 */
type AssetUrlResolver = (name: string) => string

let audioCtx: AudioContext | null = null
let bgmAudio: HTMLAudioElement | null = null
const activeEffectAudios = new Set<HTMLAudioElement>()

export function createSceneAudio(assetUrl: AssetUrlResolver) {
  // 懒创建 Web Audio 上下文（兼容 webkit 前缀）
  function ensureAudioContext() {
    if (audioCtx) return audioCtx
    const AudioCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtor) return null
    audioCtx = new AudioCtor()
    return audioCtx
  }

  function stopBackgroundMusic() {
    if (bgmAudio) {
      bgmAudio.pause()
      bgmAudio.currentTime = 0
      bgmAudio = null
    }
  }

  // 播放一次短音效；失败时用合成提示音兜底（素材缺失/格式不支持也能有声）
  function playEffectSound(name: string, volume: number) {
    const audio = new Audio(assetUrl(name))
    audio.preload = 'auto'
    audio.volume = volume
    audio.currentTime = 0
    activeEffectAudios.add(audio)

    const cleanup = () => {
      activeEffectAudios.delete(audio)
    }

    audio.addEventListener('ended', cleanup, { once: true })
    audio.addEventListener('error', cleanup, { once: true })
    audio.addEventListener('pause', cleanup, { once: true })

    audio.load()
    audio.play().catch(() => {
      cleanup()
      playTone(220, 0.14, 'sawtooth', 0.08)
      window.setTimeout(() => playTone(180, 0.16, 'sawtooth', 0.06), 80)
    })
  }

  function startBackgroundMusic() {
    if (bgmAudio) return
    const audio = new Audio(assetUrl('bgm.mp3'))
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0.05
    bgmAudio = audio
    audio.play().catch(() => {
      if (bgmAudio === audio) {
        bgmAudio = null
      }
    })
  }

  function playFailSound() {
    playEffectSound('fail.wav', 1.0)
  }

  // 合成一个短音调（oscillator + 指数衰减包络）
  function playTone(
    frequency: number,
    duration = 0.09,
    type: OscillatorType = 'sine',
    gainValue = 0.04,
  ) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    gainNode.gain.value = gainValue
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    const now = ctx.currentTime
    gainNode.gain.setValueAtTime(gainValue, now)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  function playRollSound() {
    playTone(660, 0.06, 'square', 0.03)
    window.setTimeout(() => playTone(880, 0.09, 'square', 0.035), 80)
  }

  function playMoveSound() {
    playTone(392, 0.08, 'triangle', 0.03)
    window.setTimeout(() => playTone(523.25, 0.08, 'triangle', 0.028), 80)
  }

  function playWinSound() {
    playTone(523.25, 0.12, 'triangle', 0.03)
    window.setTimeout(() => playTone(659.25, 0.12, 'triangle', 0.028), 110)
    window.setTimeout(() => playTone(783.99, 0.16, 'triangle', 0.03), 220)
  }

  // 释放全部音频资源（组件卸载时）
  function disposeAudio() {
    stopBackgroundMusic()
    activeEffectAudios.forEach((audio) => {
      audio.pause()
      audio.currentTime = 0
    })
    activeEffectAudios.clear()
    audioCtx?.close().catch(() => {})
    audioCtx = null
  }

  return {
    disposeAudio,
    playFailSound,
    playMoveSound,
    playRollSound,
    playWinSound,
    startBackgroundMusic,
    stopBackgroundMusic,
  }
}
