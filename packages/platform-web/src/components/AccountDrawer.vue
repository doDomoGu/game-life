<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { MyGameScore, SudokuDifficulty } from '@game-life/shared';
import { useAuthStore } from '../stores/auth.js';
import { useRoomStore } from '../stores/room.js';
import { changePassword, updateAvatar, updateProfile } from '../api/account.js';
import { fetchMyScores } from '../api/scores.js';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();
const roomStore = useRoomStore();
const router = useRouter();

const nicknameInput = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const busy = ref<'' | 'nickname' | 'avatar' | 'password'>('');
const notice = ref('');
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const scores = ref<MyGameScore[]>([]);
const scoresLoading = ref(false);
const scoresError = ref('');
const SUDOKU_LABELS: Record<SudokuDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

const initial = computed(() => Array.from(auth.displayName)[0] ?? '?');

function clearMessages() {
  notice.value = '';
  error.value = '';
}

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    nicknameInput.value = auth.nickname ?? auth.username ?? '';
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    clearMessages();
    void loadScores();
  },
  { immediate: true },
);

async function loadScores() {
  scoresLoading.value = true;
  scoresError.value = '';
  try {
    scores.value = await fetchMyScores();
  } catch {
    scoresError.value = '积分加载失败';
  } finally {
    scoresLoading.value = false;
  }
}

function formatMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function scoreSummary(game: MyGameScore) {
  if (game.totalGames === 0) return '—';
  if (game.style === 'wins') return `${game.wins ?? 0} 胜 / ${game.totalGames} 局`;
  if (game.style === 'time') return `${game.totalGames} 局 · 最佳 ${formatMs(game.bestTimeMs)}`;
  if (game.style === 'best') return `${game.totalGames} 局 · 最佳 ${game.bestScore ?? '—'}`;
  if (game.style === 'score') return `${game.totalGames} 局 · 最高 ${game.bestScore ?? 0} 分`;
  return `${game.totalGames} 局`;
}

async function saveNickname() {
  if (busy.value) return;
  const value = nicknameInput.value.trim();
  if (!value) {
    error.value = '昵称不能为空';
    return;
  }
  busy.value = 'nickname';
  clearMessages();
  try {
    const user = await updateProfile(value);
    auth.applyUser(user);
    nicknameInput.value = user.nickname;
    notice.value = '昵称已更新';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '昵称保存失败';
  } finally {
    busy.value = '';
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法读取'));
    image.src = src;
  });
}

async function resizeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8MB');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const side = Math.min(image.width, image.height);
    if (!side) throw new Error('图片尺寸无效');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持图片处理');
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = 'avatar';
  clearMessages();
  try {
    const dataUrl = await resizeAvatar(file);
    const user = await updateAvatar(dataUrl);
    auth.applyUser(user);
    notice.value = '头像已更新';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? (e instanceof Error ? e.message : '头像上传失败');
  } finally {
    busy.value = '';
  }
}

async function removeAvatar() {
  if (busy.value) return;
  busy.value = 'avatar';
  clearMessages();
  try {
    const user = await updateAvatar(null);
    auth.applyUser(user);
    notice.value = '头像已移除';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '头像移除失败';
  } finally {
    busy.value = '';
  }
}

async function savePassword() {
  if (busy.value) return;
  clearMessages();
  if (!currentPassword.value) {
    error.value = '请输入当前密码';
    return;
  }
  if (newPassword.value.length < 6) {
    error.value = '新密码至少 6 位';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致';
    return;
  }
  busy.value = 'password';
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    notice.value = '密码已修改';
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '密码修改失败';
  } finally {
    busy.value = '';
  }
}

function logout() {
  roomStore.clear();
  auth.logout();
  emit('close');
  void router.push({ name: 'login' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <transition name="drawer">
      <div v-if="open" class="drawer-root">
        <div class="drawer-backdrop" @click="emit('close')"></div>
        <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="账号中心">
          <header class="drawer-head">
            <span class="avatar avatar--lg">
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
              <span v-else>{{ initial }}</span>
            </span>
            <div class="identity">
              <strong>{{ auth.displayName }}</strong>
              <span>@{{ auth.username }}</span>
            </div>
            <button type="button" class="close" aria-label="关闭账号中心" @click="emit('close')">
              ×
            </button>
          </header>

          <div class="drawer-body">
            <p v-if="notice" class="notice">{{ notice }}</p>
            <p v-if="error" class="error">{{ error }}</p>

            <section class="card">
              <h3>个人资料</h3>
              <label class="field">
                <span>昵称</span>
                <input v-model="nicknameInput" maxlength="20" placeholder="输入昵称" />
              </label>
              <div class="avatar-row">
                <span class="avatar avatar--sm">
                  <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
                  <span v-else>{{ initial }}</span>
                </span>
                <div class="avatar-actions">
                  <button
                    type="button"
                    class="button button--ghost"
                    :disabled="busy !== ''"
                    @click="fileInput?.click()"
                  >
                    {{ busy === 'avatar' ? '上传中…' : '上传头像' }}
                  </button>
                  <button
                    v-if="auth.avatarUrl"
                    type="button"
                    class="button button--ghost button--danger"
                    :disabled="busy !== ''"
                    @click="removeAvatar"
                  >
                    移除
                  </button>
                </div>
                <input
                  ref="fileInput"
                  class="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  @change="onAvatarPicked"
                />
              </div>
              <p class="hint">头像会自动裁剪为 256×256，支持 PNG、JPG、WebP。</p>
              <button
                type="button"
                class="button"
                :disabled="busy !== '' || nicknameInput.trim() === (auth.nickname ?? '')"
                @click="saveNickname"
              >
                {{ busy === 'nickname' ? '保存中…' : '保存昵称' }}
              </button>
            </section>

            <section class="card">
              <h3>我的积分</h3>
              <p v-if="scoresLoading" class="hint">积分加载中…</p>
              <p v-else-if="scoresError" class="error">{{ scoresError }}</p>
              <div v-else class="score-games">
                <div v-for="game in scores" :key="game.gameId" class="score-game">
                  <div class="score-game__name">{{ game.gameName }}</div>
                  <template v-if="game.sudoku">
                    <div
                      v-for="progress in game.sudoku"
                      :key="progress.difficulty"
                      class="score-line"
                    >
                      <span>{{ SUDOKU_LABELS[progress.difficulty] }}</span>
                      <span>
                        {{ progress.completed }} / {{ progress.total }} · 最佳
                        {{ formatMs(progress.bestTimeMs) }}
                      </span>
                    </div>
                  </template>
                  <div v-else class="score-line">
                    <span>{{ game.totalGames ? '战绩' : '暂无记录' }}</span>
                    <span>{{ scoreSummary(game) }}</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="card">
              <h3>修改密码</h3>
              <label class="field">
                <span>当前密码</span>
                <input v-model="currentPassword" type="password" autocomplete="current-password" />
              </label>
              <label class="field">
                <span>新密码</span>
                <input v-model="newPassword" type="password" autocomplete="new-password" />
              </label>
              <label class="field">
                <span>确认新密码</span>
                <input v-model="confirmPassword" type="password" autocomplete="new-password" />
              </label>
              <button
                type="button"
                class="button"
                :disabled="busy !== '' || !currentPassword || !newPassword"
                @click="savePassword"
              >
                {{ busy === 'password' ? '修改中…' : '修改密码' }}
              </button>
            </section>
          </div>

          <footer class="drawer-foot">
            <button type="button" class="button button--logout" @click="logout">退出账号</button>
          </footer>
        </aside>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.66);
}
.drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(92vw, 360px);
  background: #0f172a;
  border-left: 1px solid rgba(148, 163, 184, 0.18);
  display: flex;
  flex-direction: column;
  box-shadow: -18px 0 40px rgba(0, 0, 0, 0.35);
}
.drawer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(16px + var(--safe-top)) 16px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}
.identity {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.identity strong {
  font-size: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity span {
  color: var(--muted);
  font-size: 12px;
}
.close {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(56, 189, 248, 0.18);
  color: var(--accent);
  font-weight: 700;
  flex: none;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar--lg {
  width: 48px;
  height: 48px;
  font-size: 20px;
}
.avatar--sm {
  width: 44px;
  height: 44px;
  font-size: 18px;
}
.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card h3 {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field span {
  font-size: 12px;
  color: var(--muted);
}
.field input {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.55);
  color: var(--text);
  font: inherit;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.file-input {
  display: none;
}
.button {
  min-height: 42px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--accent);
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.button--ghost {
  background: transparent;
  border-color: #334155;
  color: var(--text);
  font-weight: 500;
  padding: 0 12px;
}
.button--danger {
  color: var(--danger);
  border-color: rgba(248, 113, 113, 0.4);
}
.button--logout {
  width: 100%;
  background: transparent;
  border-color: rgba(248, 113, 113, 0.55);
  color: var(--danger);
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.score-games {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.score-game {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
}
.score-game:first-child {
  border-top: none;
  padding-top: 0;
}
.score-game__name {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}
.score-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.score-line span:last-child {
  text-align: right;
}
.notice {
  margin: 0;
  color: #4ade80;
  font-size: 13px;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
.drawer-foot {
  padding: 12px 16px calc(14px + var(--safe-bottom));
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.24s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>
