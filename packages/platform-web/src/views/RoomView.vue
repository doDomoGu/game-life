<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  backToWaiting,
  cancelRoomVote,
  castRoomVote,
  fetchRoom,
  finishRoom,
  kickRoomPlayer,
  leaveRoom,
  selectRoomGame,
  setRoomReady,
  startEndVote,
  startRematchVote,
  startRoom,
  type RoomView,
} from '../api/rooms.js';
import { gameCapacityLabel } from '@game-life/shared';
import { getWebGameById, listWebGames } from '../games/registry.js';
import { createGameSocket, type ConnectionState, type GameSocket } from '../realtime/socket.js';
import { ROOM_PLAY_KEY } from '../room/playKey.js';
import { useAuthStore } from '../stores/auth.js';
import { useRoomStore } from '../stores/room.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const roomStore = useRoomStore();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const room = ref<RoomView | null>(null);
const error = ref('');
const games = listWebGames();
const playComponent = shallowRef<ReturnType<typeof defineAsyncComponent> | null>(null);
const now = ref(Date.now());
const connection = ref<ConnectionState>('connecting');
let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let socket: GameSocket | null = null;

const LIVE_POLL_MS = 10_000;
const FALLBACK_POLL_MS = 2_000;

const isHost = computed(() => !!room.value && room.value.hostUserId === auth.userId);
const selectedGame = computed(() => (room.value?.gameId ? getWebGameById(room.value.gameId) : undefined));
const isSolo = computed(() => (room.value?.maxPlayers ?? 0) === 1);
const isPlaying = computed(() => room.value?.status === 'playing');
const showGame = computed(
  () =>
    !!room.value &&
    (room.value.status === 'playing' ||
      (room.value.status === 'finished' && room.value.endReason === 'finished')),
);
const canLeave = computed(
  () =>
    !!room.value &&
    (room.value.status !== 'playing' || isSolo.value || room.value.playerCount === 1),
);
const canEndVote = computed(
  () => isPlaying.value && !isSolo.value && (room.value?.playerCount ?? 0) > 1,
);
const vote = computed(() => room.value?.vote ?? null);
const isVoteInitiator = computed(() => !!vote.value && vote.value.initiatorId === auth.userId);
const myVote = computed(() =>
  auth.userId && vote.value ? vote.value.votes[auth.userId] : undefined,
);
const voteSeconds = computed(() =>
  Math.max(0, Math.ceil(((vote.value?.expiresAt ?? 0) - now.value) / 1000)),
);
const voteInitiatorName = computed(
  () =>
    room.value?.players.find((p) => p.userId === vote.value?.initiatorId)?.username ?? '玩家',
);
const voteYesCount = computed(() => {
  const active = vote.value;
  if (!active) return 0;
  return Object.entries(active.votes).filter(
    ([userId, value]) => userId !== active.initiatorId && value === 'yes',
  ).length;
});
const voteEligibleCount = computed(() => {
  const current = room.value;
  const active = vote.value;
  if (!current || !active) return 0;
  return current.players.filter(
    (p) => p.userId !== active.initiatorId && (active.kind === 'rematch' || p.connected),
  ).length;
});
const myReady = computed(
  () => room.value?.players.find((p) => p.userId === auth.userId)?.ready === true,
);
const guestsNotReady = computed(
  () => room.value?.players.filter((p) => p.role === 'guest' && !p.ready) ?? [],
);
const canStart = computed(() => {
  const current = room.value;
  const game = selectedGame.value;
  if (!current || !game || current.status !== 'waiting') return false;
  if (current.playerCount < game.minPlayers || current.playerCount > game.maxPlayers) return false;
  return guestsNotReady.value.length === 0;
});
const canRematch = computed(() => {
  const current = room.value;
  const game = selectedGame.value;
  if (!current || !game || current.status !== 'finished') return false;
  return current.playerCount >= game.minPlayers && current.playerCount <= game.maxPlayers;
});
const statusLabel = computed(() => {
  const current = room.value;
  if (!current) return '';
  if (current.status === 'waiting') return '等待中';
  if (current.status === 'playing') return '对局中';
  return current.endReason === 'aborted' ? '本局已中止' : '本局已结束';
});
const gameHint = computed(() => {
  const game = selectedGame.value;
  const current = room.value;
  if (!game || !current) return '';
  const capacity =
    game.minPlayers === game.maxPlayers
      ? `是${gameCapacityLabel(game.minPlayers, game.maxPlayers)}`
      : `需要 ${gameCapacityLabel(game.minPlayers, game.maxPlayers)}`;
  return `「${game.name}」${capacity}，当前 ${current.playerCount} 人`;
});

function messageOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  return undefined;
}

function statusOf(e: unknown) {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

async function refresh() {
  if (!code.value) return;
  try {
    const next = await fetchRoom(code.value);
    room.value = next;
    roomStore.mine = next;
    error.value = '';
  } catch (e: unknown) {
    const status = statusOf(e);
    if (status === 403 || status === 404 || status === 409) {
      const notice = messageOf(e) ?? '房间已关闭';
      socket?.close();
      socket = null;
      roomStore.clear();
      await router.replace({ name: 'lobby', query: { notice } });
      return;
    }
    error.value = messageOf(e) ?? '房间不存在';
  }
}

function startPolling(ms: number) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, ms);
}

function connectRoomSocket() {
  if (!auth.token || !code.value) return;
  socket?.close();
  socket = createGameSocket({
    path: `/api/rooms/${encodeURIComponent(code.value)}/ws`,
    token: auth.token,
    onStatus(state) {
      connection.value = state;
      startPolling(state === 'open' ? LIVE_POLL_MS : FALLBACK_POLL_MS);
    },
    onMessage(message) {
      if (message.type === 'room:update' && message.payload) {
        apply(message.payload as RoomView);
        return;
      }
      if (message.type === 'room:closed' || message.type === 'room:kicked') {
        const payload = message.payload as { message?: string } | undefined;
        const notice =
          payload?.message ??
          (message.type === 'room:kicked' ? '你已被房主移出房间' : '房间已关闭');
        socket?.close();
        socket = null;
        roomStore.clear();
        void router.replace({ name: 'lobby', query: { notice } });
      }
    },
  });
}

function apply(next: RoomView) {
  room.value = next;
  roomStore.mine = next;
}

async function run(action: () => Promise<RoomView>, fallback: string) {
  error.value = '';
  try {
    apply(await action());
  } catch (e: unknown) {
    error.value = messageOf(e) ?? fallback;
    await refresh();
  }
}

async function onSelect(gameId: string) {
  if (!gameId || gameId === room.value?.gameId) return;
  await run(() => selectRoomGame(code.value, gameId), '无法选择该游戏');
}

async function onStart() {
  await run(() => startRoom(code.value), '无法开始');
}

async function onToggleReady() {
  await run(() => setRoomReady(code.value, !myReady.value), '无法修改准备状态');
}

async function onKick(player: RoomView['players'][number]) {
  if (!window.confirm(`把「${player.username}」移出房间？`)) return;
  await run(() => kickRoomPlayer(code.value, player.userId), '无法移出玩家');
}

async function onLeave() {
  error.value = '';
  const inGame = room.value?.status === 'playing';
  if (inGame && !window.confirm('对局还没有结束，退出后本局不会记录成绩，确定放弃吗？')) return;
  try {
    await leaveRoom();
    roomStore.clear();
    await router.replace({ name: 'lobby' });
  } catch (e: unknown) {
    error.value = messageOf(e) ?? '离开失败';
  }
}

async function onEndVote() {
  if (!window.confirm('发起结束本局的投票？需要其他在线玩家全部同意。')) return;
  await run(() => startEndVote(code.value), '无法发起投票');
}

async function onRematch() {
  await run(() => startRematchVote(code.value), '无法发起再来一局');
}

async function onVote(decision: 'yes' | 'no') {
  await run(() => castRoomVote(code.value, decision), '投票失败');
}

async function onCancelVote() {
  await run(() => cancelRoomVote(code.value), '无法撤回投票');
}

async function onBackToWaiting() {
  if (!window.confirm('回到等待房？本局结果会离开结算页，可以重新选游戏或等人。')) return;
  await run(() => backToWaiting(code.value), '无法返回等待房');
}

provide(ROOM_PLAY_KEY, {
  get code() {
    return code.value;
  },
  async complete() {
    apply(await finishRoom(code.value));
  },
});

watch(
  () => (room.value?.status === 'waiting' ? '' : (room.value?.gameId ?? '')),
  (gameId) => {
    if (!gameId) {
      playComponent.value = null;
      return;
    }
    const game = getWebGameById(gameId);
    playComponent.value = game?.loadPlay
      ? defineAsyncComponent(game.loadPlay as () => Promise<{ default: object }>)
      : null;
  },
);

onMounted(() => {
  if (route.query.stay) {
    void router.replace({ name: 'room', params: { code: code.value } });
  }
  refresh();
  startPolling(FALLBACK_POLL_MS);
  connectRoomSocket();
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  socket?.close();
  socket = null;
});
</script>

<template>
  <div class="page room" :class="{ 'room--stage': showGame }">
    <header class="room__top">
      <div>
        <h1>房间 {{ room?.code ?? code }}</h1>
        <p class="sub">
          {{ statusLabel }}
          <template v-if="room"> · {{ room.playerCount }} 人</template>
          <span v-if="room?.gameName"> · {{ room.gameName }}</span>
        </p>
      </div>
      <button v-if="canLeave" type="button" class="btn btn--ghost" @click="onLeave">离开</button>
      <button
        v-else-if="canEndVote && !vote"
        type="button"
        class="btn btn--ghost"
        @click="onEndVote"
      >
        申请结束
      </button>
      <span v-else-if="vote" class="vote-chip">投票中 {{ voteSeconds }}s</span>
    </header>

    <p v-if="connection === 'closed'" class="hint connection">实时连接中断，正在重连…</p>

    <section v-if="vote && isPlaying" class="vote-banner">
      <p>
        <strong>{{ voteInitiatorName }}</strong> 申请结束对局 · 其他玩家同意
        {{ voteYesCount }}/{{ voteEligibleCount }} · {{ voteSeconds }}s
      </p>
      <div class="vote-actions">
        <button v-if="isVoteInitiator" type="button" class="btn btn--ghost" @click="onCancelVote">
          撤回
        </button>
        <template v-else-if="!myVote">
          <button type="button" class="btn" @click="onVote('yes')">同意</button>
          <button type="button" class="btn btn--ghost" @click="onVote('no')">拒绝</button>
        </template>
        <span v-else class="hint">已{{ myVote === 'yes' ? '同意' : '拒绝' }}</span>
      </div>
    </section>

    <template v-if="room">
      <template v-if="room.status === 'waiting'">
        <section>
          <h2>玩家（{{ room.playerCount }}）</h2>
          <ul class="players room-roster">
            <li v-for="player in room.players" :key="player.userId">
              <span class="player-name">
                <span class="dot" :class="{ online: player.connected }" aria-hidden="true"></span>
                {{ player.username }}
                <span v-if="player.userId === auth.userId" class="self">（我）</span>
              </span>
              <span class="player-actions">
                <span class="role">
                  {{ player.role === 'host' ? '房主' : player.ready ? '已准备' : '未准备' }}
                </span>
                <button
                  v-if="isHost && player.role === 'guest' && room.status === 'waiting'"
                  type="button"
                  class="kick"
                  @click="onKick(player)"
                >
                  移出
                </button>
              </span>
            </li>
          </ul>
        </section>

        <section v-if="!isHost" class="ready-box">
          <button type="button" class="btn" :disabled="room.status !== 'waiting'" @click="onToggleReady">
            {{ myReady ? '取消准备' : '准备' }}
          </button>
          <p class="hint">
            {{
              room.gameName
                ? `当前游戏：${room.gameName}，等待房主开始`
                : '等待房主选择游戏'
            }}
          </p>
        </section>

        <section v-if="isHost">
          <h2>选择游戏</h2>
          <select
            class="game-select"
            :value="room.gameId ?? ''"
            @change="onSelect(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>请选择游戏</option>
            <option v-for="game in games" :key="game.id" :value="game.id">
              {{ game.name }}（{{ gameCapacityLabel(game.minPlayers, game.maxPlayers) }}）
            </option>
          </select>
          <p v-if="selectedGame" class="hint">{{ gameHint }}</p>
          <p v-if="guestsNotReady.length" class="hint">
            等待
            {{ guestsNotReady.map((p) => `${p.username}${p.connected ? '' : '（离线）'}`).join('、') }}
            准备
          </p>
          <button type="button" class="btn start" :disabled="!canStart" @click="onStart">
            开始游戏
          </button>
        </section>
      </template>

      <template v-else>
        <div v-if="showGame" class="room-stage">
          <component :is="playComponent" v-if="playComponent" :key="room.roundId" />
        </div>

        <section v-else class="abort-panel">
          <h2>本局已中止</h2>
          <p class="hint">投票通过后本局不再继续，也不会记录成绩。</p>
        </section>

        <section v-if="room.status === 'finished'" class="settlement">
          <div v-if="vote && vote.kind === 'rematch'" class="vote-actions">
            <span class="hint">
              再来一局 · 其他玩家同意 {{ voteYesCount }}/{{ voteEligibleCount }} ·
              {{ voteSeconds }}s
            </span>
            <button v-if="isVoteInitiator" type="button" class="btn btn--ghost" @click="onCancelVote">
              撤回
            </button>
            <template v-else-if="!myVote">
              <button type="button" class="btn" @click="onVote('yes')">同意</button>
              <button type="button" class="btn btn--ghost" @click="onVote('no')">拒绝</button>
            </template>
            <span v-else class="hint">已{{ myVote === 'yes' ? '同意' : '拒绝' }}</span>
          </div>
          <template v-else>
            <div class="settlement__actions">
              <button
                v-if="isHost"
                type="button"
                class="btn"
                :disabled="!canRematch"
                @click="onRematch"
              >
                再来一局
              </button>
              <button v-if="isHost" type="button" class="btn btn--ghost" @click="onBackToWaiting">
                返回等待房
              </button>
            </div>
            <p v-if="!canRematch" class="hint">
              当前人数不满足本游戏的开局要求，请返回等待房等人或离开。
            </p>
            <p v-else class="hint">
              「再来一局」需要所有玩家同意{{ isHost ? '，由房主发起' : '，等待房主发起' }}。
            </p>
          </template>
        </section>
      </template>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.room__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.04em;
}
.sub,
.hint {
  color: var(--muted);
  font-size: 14px;
  margin: 4px 0 0;
}
h2 {
  margin: 18px 0 8px;
  font-size: 14px;
  color: var(--muted);
}
.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.players li {
  display: flex;
  justify-content: space-between;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 10px 14px;
}
.player-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.self {
  color: var(--muted);
  font-size: 12px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}
.dot.online {
  background: #4ade80;
}
.role {
  color: var(--accent);
  font-size: 13px;
}
.player-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.kick {
  border: 1px solid rgba(248, 113, 113, 0.5);
  background: transparent;
  color: var(--danger);
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}
.connection {
  margin: 0 0 8px;
  color: var(--danger);
}
.ready-box {
  margin-top: 18px;
}
.ready-box .btn {
  width: 100%;
}
.game-select {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 12px;
  border-radius: var(--radius);
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
}
.start {
  width: 100%;
  margin-top: 14px;
}
.vote-chip {
  color: var(--accent);
  font-size: 14px;
  white-space: nowrap;
}
.vote-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--surface);
  border-radius: var(--radius);
  background: var(--surface);
  flex: none;
}
.vote-banner p {
  margin: 0;
  font-size: 14px;
}
.vote-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vote-actions .btn {
  min-height: 36px;
  padding: 0 14px;
  font-size: 14px;
}
.room--stage {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.room--stage .room-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.abort-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.abort-panel h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--text);
}
.settlement {
  flex: none;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.settlement__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.settlement__actions .btn {
  flex: 1;
  min-width: 110px;
}
</style>
