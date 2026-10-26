<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import GameBackdrop from './shell/GameBackdrop.vue';
import { SHELL_MATCH_KEY } from './shell/matchKey.js';

const route = useRoute();
const matchActive = ref(false);
provide(SHELL_MATCH_KEY, matchActive);

watch(
  () => route.fullPath,
  () => {
    if (route.name !== 'room') matchActive.value = false;
  },
);

const showShell = computed(() => {
  if (route.meta.adminGuest || route.meta.requiresAdmin || route.meta.chrome === 'play') return false;
  return !matchActive.value;
});
</script>

<template>
  <div class="app-root" :class="{ 'app-shell': showShell }">
    <GameBackdrop v-show="showShell" :paused="!showShell" />
    <div class="app-content">
      <RouterView />
    </div>
  </div>
</template>
