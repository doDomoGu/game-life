<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ROOM_PLAY_KEY, useAuthStore, type RoomPlayContext } from '@game-life/platform-web';
import HanabiCard from './HanabiCard.vue';
import { COLOR_LABELS, COLORS, type Color } from '../colors.js';
import type { HanabiView } from '../view.js';
import {
  fetchHanabiRoom,
  sendHanabiAction,
  type HanabiActionMessage,
} from './api.js';
import { resultText } from './labels.js';
import { createHanabiSocket, type ConnectionState, type HanabiSocket } from './socket.js';

const play = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);
const auth = useAuthStore();
const code = computed(() => play?.code ?? '');

const view = ref<HanabiView | null>(null);
const error = ref('');
const loading = ref(true);
const busy = ref(false);
const connection = ref<ConnectionState>('connecting');

const selectedCardId = ref<string | null>(null);
const showDiscard = ref(false);
const openHint = ref(false);
const hintTarget = ref('');
const hintType = ref<'color' | 'value'>('color');
const hintValue = ref<Color | number | null>(null);

let socket: HanabiSocket | null = null;

const game = computed(() => view.value?.game ?? null);
const myId = computed(() => auth.userId ?? '');
const myHand = computed(() => (myId.value ? (game.value?.hands[myId.value] ?? []) : []));
const otherIds = computed(
  () => game.value?.playerOrder.filter((id) => id !== myId.value) ?? [],
);
const currentName = computed(() => nameOf(game.value?.currentPlayerId));

const waitingReconnect = computed(() => {
  const g = game.value;
  if (!g || g.result) return false;
  const current = view.value?.players.find((p) => p.userId === g.currentPlayerId);
  return Boolean(current && !current.connected);
});

const canAct = computed(() => {
  const g = game.value;
  if (!g || g.result || waitingReconnect.value) return false;
  return g.currentPlayerId === myId.value;
});

const hintPreviewIndexes = computed<number[]>(() => {
  if (!hintTarget.value || hintValue.value == null || !game.value) return [];
  const hand = game.value.hands[hintTarget.value] ?? [];
  return hand
    .map((card, index) => {
      if (hintType.value === 'color') return card.color === hintValue.value ? index : -1;
      return card.value === hintValue.value ? index : -1;
    })
    .filter((index) => index >= 0);
});

const canSubmitHint = computed(
  () =>
    canAct.value &&
    Boolean(hintTarget.value) &&
    hintValue.value != null &&
    hintPreviewIndexes.value.length > 0,
);

const resultLine = computed(() =>
  resultText(game.value?.result ?? null, game.value?.score ?? null, game.value?.scoreLabel ?? null),
);

function nameOf(userId?: string | null): string {
  return view.value?.players.find((p) => p.userId === userId)?.username ?? '玩家';
}

function connectedOf(userId: string): boolean {
  return view.value?.players.find((p) => p.userId === userId)?.connected ?? true;
}

function cardIndex(userId: string, cardId: string): number {
  return (game.value?.hands[userId] ?? []).findIndex((card) => card.id === cardId);
}

function messageOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  if (err instanceof Error) return err.message;
  return undefined;
}

async function act(message: HanabiActionMessage): Promise<void> {
  error.value = '';
  if (socket?.isOpen()) {
    socket.send(message);
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    view.value = await sendHanabiAction(code.value, message);
  } catch (err) {
    error.value = messageOf(err) ?? '操作失败';
  } finally {
    busy.value = false;
  }
}

function confirmPlay(): void {
  const cardId = selectedCardId.value;
  if (!cardId) return;
  if (!window.confirm('确认打出这张牌？')) return;
  void act({ type: 'action:play', payload: { cardId } });
  selectedCardId.value = null;
}

function confirmDiscard(): void {
  const cardId = selectedCardId.value;
  if (!cardId) return;
  if (!window.confirm('确认弃掉这张牌？')) return;
  void act({ type: 'action:discard', payload: { cardId } });
  selectedCardId.value = null;
}

function setHintType(type: 'color' | 'value'): void {
  hintType.value = type;
  hintValue.value = null;
}

function closeHint(): void {
  openHint.value = false;
  hintTarget.value = '';
  hintValue.value = null;
}

function submitHint(): void {
  if (!canSubmitHint.value) return;
  void act({
    type: 'action:hint',
    payload: {
      targetPlayerId: hintTarget.value,
      hintType: hintType.value,
      value: hintValue.value,
    },
  });
  closeHint();
}

onMounted(async () => {
  if (!code.value) {
    error.value = '缺少房间信息';
    loading.value = false;
    return;
  }
  try {
    view.value = await fetchHanabiRoom(code.value);
  } catch (err) {
    error.value = messageOf(err) ?? '加载对局失败';
  } finally {
    loading.value = false;
  }
  if (auth.token) {
    socket = createHanabiSocket({
      code: code.value,
      token: auth.token,
      onUpdate: (next) => {
        view.value = next;
        error.value = '';
      },
      onError: (message) => {
        error.value = message;
      },
      onStatus: (state) => {
        connection.value = state;
      },
    });
  }
});

onBeforeUnmount(() => {
  socket?.close();
  socket = null;
});

watch(
  () => game.value?.currentPlayerId,
  () => {
    selectedCardId.value = null;
    closeHint();
  },
);
</script>

<template>
  <div class="game">
    <p v-if="loading" class="muted">加载对局中…</p>

    <template v-if="game">
      <section class="panel top">
        <div class="meters">
          <span>提示 <strong>{{ game.hints }}</strong>/8</span>
          <span>失误 <strong>{{ 3 - game.fuses }}</strong>/3</span>
          <span>牌库 <strong>{{ game.deckCount }}</strong></span>
          <span v-if="connection !== 'open'" class="link-state">
            {{ connection === 'connecting' ? '连接中…' : '重连中…' }}
          </span>
        </div>
        <p class="turn">
          <template v-if="game.result">本局结束</template>
          <template v-else-if="waitingReconnect">等待 {{ currentName }} 重连中…</template>
          <template v-else>
            当前回合：{{ currentName }}
            <strong v-if="canAct" class="mine">（你的回合）</strong>
          </template>
        </p>
        <p v-if="!game.result && game.phase === 'finalRound'" class="final">
          牌库已空 · 最后 {{ game.finalTurnsLeft ?? 0 }} 手
        </p>
      </section>

      <section class="panel fireworks" aria-label="烟花进度">
        <div v-for="color in COLORS" :key="color" class="fw" :class="`fw--${color}`">
          <span class="fw__label">{{ COLOR_LABELS[color] }}</span>
          <strong class="fw__value">{{ game.fireworks[color] }}</strong>
        </div>
      </section>

      <section class="others">
        <div v-for="pid in otherIds" :key="pid" class="panel player-block">
          <div class="player-head">
            <strong>{{ nameOf(pid) }}</strong>
            <span v-if="!connectedOf(pid)" class="offline">离线</span>
            <span v-if="game.currentPlayerId === pid" class="badge">行动中</span>
          </div>
          <div class="hand-row">
            <HanabiCard
              v-for="card in game.hands[pid] ?? []"
              :key="card.id"
              :card="card"
              :highlight="hintTarget === pid && hintPreviewIndexes.includes(cardIndex(pid, card.id))"
              disabled
            />
          </div>
        </div>
      </section>

      <section class="panel my-area">
        <div class="player-head">
          <strong>我的手牌</strong>
          <button type="button" class="link" @click="showDiscard = !showDiscard">
            弃牌区（{{ game.discard.length }}）
          </button>
        </div>

        <div class="hand-row">
          <HanabiCard
            v-for="card in myHand"
            :key="card.id"
            :card="card"
            hidden
            :selected="selectedCardId === card.id"
            :disabled="!canAct"
            @select="selectedCardId = card.id"
          />
        </div>

        <div v-if="showDiscard" class="discard">
          <HanabiCard v-for="card in game.discard" :key="card.id" :card="card" disabled />
        </div>

        <div v-if="!game.result" class="actions">
          <button
            type="button"
            class="act act--play"
            :disabled="!canAct || !selectedCardId || busy"
            @click="confirmPlay"
          >
            出牌
          </button>
          <button
            type="button"
            class="act"
            :disabled="!canAct || !selectedCardId || game.hints >= 8 || busy"
            @click="confirmDiscard"
          >
            弃牌
          </button>
          <button
            type="button"
            class="act act--ghost"
            :disabled="!canAct || game.hints <= 0 || busy"
            @click="openHint = true"
          >
            提示
          </button>
        </div>

        <div v-else class="result">
          <p class="result__line">{{ resultLine }}</p>
          <div class="result__score">
            <span v-for="color in COLORS" :key="color" :class="`fw--${color}`">
              {{ COLOR_LABELS[color] }} {{ game.fireworks[color] }}
            </span>
          </div>
          <p class="muted">本局已结束，等待房间结算。</p>
        </div>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
    </template>

    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-if="openHint" class="modal" @click.self="closeHint">
      <div class="panel modal-card">
        <h3>给出提示</h3>

        <label class="muted">选择队友</label>
        <div class="chip-row">
          <button
            v-for="pid in otherIds"
            :key="pid"
            type="button"
            class="chip"
            :class="{ on: hintTarget === pid }"
            @click="hintTarget = pid"
          >
            {{ nameOf(pid) }}
          </button>
        </div>

        <label class="muted">提示类型</label>
        <div class="chip-row">
          <button
            type="button"
            class="chip"
            :class="{ on: hintType === 'color' }"
            @click="setHintType('color')"
          >
            颜色
          </button>
          <button
            type="button"
            class="chip"
            :class="{ on: hintType === 'value' }"
            @click="setHintType('value')"
          >
            数字
          </button>
        </div>

        <div class="chip-row">
          <template v-if="hintType === 'color'">
            <button
              v-for="color in COLORS"
              :key="color"
              type="button"
              class="chip"
              :class="[{ on: hintValue === color }, `chip--${color}`]"
              @click="hintValue = color"
            >
              {{ COLOR_LABELS[color] }}
            </button>
          </template>
          <template v-else>
            <button
              v-for="n in [1, 2, 3, 4, 5]"
              :key="n"
              type="button"
              class="chip"
              :class="{ on: hintValue === n }"
              @click="hintValue = n"
            >
              {{ n }}
            </button>
          </template>
        </div>

        <p v-if="hintTarget && hintValue != null" class="muted">
          将指出 {{ hintPreviewIndexes.length }} 张牌
        </p>

        <button type="button" class="act" :disabled="!canSubmitHint" @click="submitHint">
          确认提示
        </button>
        <button type="button" class="act act--ghost" @click="closeHint">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 8px;
}

.panel {
  background: rgba(24, 39, 62, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 14px;
}

.top {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 13px;
  color: var(--muted);
}

.meters strong {
  color: var(--text);
}

.link-state {
  color: #fbbf24;
}

.turn {
  margin: 0;
  font-size: 15px;
}

.mine {
  color: var(--accent);
}

.final {
  margin: 0;
  font-size: 13px;
  color: #fbbf24;
}

.fireworks {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 10px;
}

.fw {
  border-radius: 12px;
  padding: 8px 4px;
  text-align: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
}

.fw__label {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

.fw__value {
  display: block;
  margin-top: 2px;
  font-size: 20px;
}

.fw--red {
  color: #e35d6a;
}

.fw--yellow {
  color: #e8c547;
}

.fw--green {
  color: #5ecf86;
}

.fw--blue {
  color: #5b9cf5;
}

.fw--white {
  color: #f2f4f7;
}

.others {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-block {
  padding: 12px 14px;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
}

.badge {
  font-size: 12px;
  color: var(--accent);
}

.offline {
  font-size: 12px;
  color: #f87171;
}

.hand-row,
.discard {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.discard {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.act {
  min-height: 46px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}

.act--play {
  background: var(--accent);
  border-color: transparent;
  color: #0f172a;
}

.act--ghost {
  background: transparent;
}

.act:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.link {
  margin-left: auto;
  background: none;
  border: 0;
  padding: 0;
  color: var(--accent);
  font-size: 13px;
}

.result {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result__line {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.result__score {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: end center;
  padding: 16px;
}

.modal-card {
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: var(--safe-bottom);
}

.modal-card h3 {
  margin: 0;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border-radius: 999px;
  padding: 9px 14px;
  min-height: 40px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.18);
}

.chip--red {
  color: #ff9aa5;
}

.chip--yellow {
  color: #f3d36a;
}

.chip--green {
  color: #8be0aa;
}

.chip--blue {
  color: #93bdfb;
}

.chip--white {
  color: #f2f4f7;
}

.muted {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.error {
  color: #f87171;
  font-size: 14px;
  margin: 0;
}
</style>
