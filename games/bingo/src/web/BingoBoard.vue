<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { BingoRoomView } from './api.js';
import { BingoScene, type BingoSceneState } from './scene/BingoScene.js';

const props = defineProps<{ room: BingoRoomView }>();

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const failed = ref(false);
const scene = shallowRef<BingoScene | null>(null);
const placeholderHeight = ref(BingoScene.heightFor(320));

const litCount = computed(() => props.room.myMarked?.filter(Boolean).length ?? 0);

let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

function toState(room: BingoRoomView): BingoSceneState {
  return {
    board: room.myBoard,
    marked: room.myMarked,
    itemLabels: room.itemLabels,
    drawnItemIds: room.drawnItemIds,
    currentItemId: room.currentItemId,
    winnerUserId: room.winner?.userId ?? null,
  };
}

onMounted(async () => {
  const canvasEl = canvas.value;
  const hostEl = host.value;
  if (!canvasEl || !hostEl) return;

  placeholderHeight.value = BingoScene.heightFor(hostEl.clientWidth || 320);

  try {
    const created = await BingoScene.create(canvasEl, {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    if (disposed) {
      created.destroy();
      return;
    }
    scene.value = created;
    created.setState(toState(props.room));
    created.resize(hostEl.clientWidth);

    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      // 画布高度随宽度变化，直接同步改尺寸会触发 ResizeObserver 回环，放到下一帧处理
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        scene.value?.resize(width);
      });
    });
    observer.observe(hostEl);
  } catch (error) {
    console.error('[bingo] WebGL 场景初始化失败，回退到基础棋盘', error);
    failed.value = true;
  }
});

watch(
  () => props.room,
  (room) => {
    scene.value?.setState(toState(room));
  },
);

onBeforeUnmount(() => {
  disposed = true;
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = 0;
  observer?.disconnect();
  observer = null;
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div
    ref="host"
    class="bingo-stage"
    role="img"
    :aria-label="`Bingo 棋盘，已点亮 ${litCount} / 25 格`"
  >
    <canvas ref="canvas" v-show="!failed" class="bingo-stage__canvas"></canvas>

    <div
      v-if="!scene && !failed"
      class="bingo-stage__loading"
      :style="{ height: `${placeholderHeight}px` }"
    >
      正在准备棋盘…
    </div>

    <div v-if="failed" class="bingo-stage__fallback">
      <div class="fallback-grid">
        <div
          v-for="(itemId, idx) in room.myBoard ?? []"
          :key="idx"
          class="fallback-cell"
          :class="{ 'fallback-cell--marked': room.myMarked?.[idx] }"
        >
          {{ room.itemLabels[itemId] ?? '?' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bingo-stage {
  position: relative;
  width: 100%;
  margin: 14px 0 0;
}

.bingo-stage__canvas {
  display: block;
  width: 100%;
  max-width: 100%;
  border-radius: 26px;
}

.bingo-stage__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26px;
  background: #091223;
  color: var(--muted);
  font-size: 14px;
}

.bingo-stage__fallback {
  padding: 12px;
  border-radius: 20px;
  background: var(--surface);
}

.fallback-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.fallback-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #14243a;
  font-size: clamp(18px, 5vw, 26px);
  opacity: 0.45;
}

.fallback-cell--marked {
  opacity: 1;
  background: #0d4a63;
  box-shadow: 0 0 0 2px var(--accent);
}
</style>
