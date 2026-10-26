<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import GameBackdrop from './shell/GameBackdrop.vue';

const route = useRoute();

const showShell = computed(() => !route.meta.adminGuest && !route.meta.requiresAdmin);
const stageOnly = computed(() => route.meta.chrome === 'play');
</script>

<template>
  <div class="app-root" :class="{ 'app-shell': showShell, 'app-stage': showShell && stageOnly }">
    <GameBackdrop v-show="showShell" :paused="!showShell" />
    <div class="app-content">
      <RouterView />
    </div>
  </div>
</template>
