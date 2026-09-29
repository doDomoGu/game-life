<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { bingoRoutes } from '../routes.js';
import { createBingoRoom, joinBingoRoom } from './api.js';

const router = useRouter();
const joinCode = ref('');
const error = ref('');
const loading = ref(false);

async function onCreate() {
  error.value = '';
  loading.value = true;
  try {
    const room = await createBingoRoom();
    await router.push({ name: bingoRoutes.roomRouteName, params: { code: room.code } });
  } catch (e: unknown) {
    error.value = '创建失败';
  } finally {
    loading.value = false;
  }
}

async function onJoin() {
  error.value = '';
  const code = joinCode.value.trim().toUpperCase();
  if (!code) {
    error.value = '请输入房间号';
    return;
  }
  loading.value = true;
  try {
    await joinBingoRoom(code);
    await router.push({ name: bingoRoutes.roomRouteName, params: { code } });
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    error.value = msg ?? '加入失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <RouterLink :to="bingoRoutes.introRoutePath" class="back">← Bingo 介绍</RouterLink>
    <h1>房间大厅</h1>
    <p class="sub">创建房间成为房主，或输入房间号加入（1～8 人）</p>

    <button type="button" class="btn" style="width: 100%; margin-bottom: 20px" :disabled="loading" @click="onCreate">
      创建房间
    </button>

    <div class="join">
      <label for="code">房间号</label>
      <input id="code" v-model="joinCode" placeholder="6 位字母数字" autocapitalize="characters" />
      <button type="button" class="btn btn--ghost" style="width: 100%" :disabled="loading" @click="onJoin">
        加入房间
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.back {
  font-size: 14px;
  display: inline-block;
  margin-bottom: 12px;
}
h1 {
  margin: 0 0 4px;
  font-size: 24px;
}
.sub {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 20px;
}
.join {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.join label {
  font-size: 14px;
  color: var(--muted);
}
.join input {
  min-height: var(--touch-min);
  padding: 0 12px;
  border-radius: var(--radius);
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
