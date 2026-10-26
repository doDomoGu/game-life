<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Application } from 'pixi.js';
import { createBackdrop } from './backdropScene.js';

const props = defineProps<{ paused: boolean }>();

const host = ref<HTMLElement | null>(null);
let app: Application | null = null;
let disposed = false;

onMounted(async () => {
  const view = host.value;
  if (!view) return;
  const application = new Application();
  await application.init({
    resizeTo: view,
    background: 0x070d16,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    powerPreference: 'low-power',
  });
  if (disposed || !host.value) {
    application.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    return;
  }
  host.value.appendChild(application.canvas);
  const scene = createBackdrop(application);
  application.stage.addChild(scene.root);
  application.ticker.add(scene.tick);
  application.ticker.maxFPS = 30;
  app = application;
  if (props.paused) application.stop();
});

watch(
  () => props.paused,
  (paused) => {
    if (!app) return;
    if (paused) {
      app.stop();
      return;
    }
    app.resize();
    app.start();
  },
);

onBeforeUnmount(() => {
  disposed = true;
  app?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
  app = null;
});
</script>

<template>
  <div ref="host" class="backdrop" aria-hidden="true" />
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.backdrop :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
