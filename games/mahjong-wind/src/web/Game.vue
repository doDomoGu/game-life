<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { ROOM_PLAY_KEY, useAuthStore, type GameSocket, type RoomPlayContext } from '@game-life/platform-web';
import type { MahjongWindView } from '../view.js';
import {
  createWindSocket,
  fetchWindRoom,
  sendWindAction,
  type ConnectionState,
  type WindActionMessage,
} from './api.js';
import { WindScene, type WindIntent, type WindModal, type WindSceneState } from './scene/WindScene.js';

const play = inject<RoomPlayContext | null>(ROOM_PLAY_KEY, null);
const auth = useAuthStore();
const code = computed(() => play?.code ?? '');
const myId = computed(() => auth.userId ?? '');

const view = ref<MahjongWindView | null>(null);
const loading = ref(true);
const loadError = ref('');
const notice = ref('');
const connection = ref<ConnectionState>('connecting');
const scoreMode = ref<'absolute' | 'diff'>('absolute');
const modal = ref<WindModal | null>(null);
const busy = ref(false);
let pendingConfirm: WindActionMessage | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let socket: GameSocket | null = null;

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const scene = shallowRef<WindScene | null>(null);
const sceneError = ref('');
let observer: ResizeObserver | null = null;
let resizeRaf = 0;
let disposed = false;

const game = computed(() => view.value?.game ?? null);

function messageOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { data?: { message?: string } } }).response?.data?.message;
  }
  if (err instanceof Error) return err.message;
  return undefined;
}

function flash(message: string) {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = '';
    noticeTimer = null;
  }, 3000);
}

async function act(message: WindActionMessage) {
  if (socket?.isOpen()) {
    socket.send(message);
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    view.value = await sendWindAction(code.value, message);
  } catch (err) {
    flash(messageOf(err) ?? '操作失败');
  } finally {
    busy.value = false;
  }
}

function confirm(title: string, message: string, okLabel: string, action: WindActionMessage) {
  pendingConfirm = action;
  modal.value = { type: 'confirm', title, message, okLabel };
}

function closeModal() {
  modal.value = null;
  pendingConfirm = null;
}

function dealerLocked(): boolean {
  const g = game.value;
  return Boolean(g && g.riichi[g.seats[g.dealerWind]]);
}

function startSettle(kind: 'win' | 'draw', dealerFlag: boolean) {
  closeModal();
  void act({ type: 'action:settle-start', payload: { kind, dealerFlag } });
}

function submitScore(value: number) {
  closeModal();
  void act({ type: 'action:settle-submit', payload: { value } });
}

function pressPad(key: string) {
  const current = modal.value;
  if (current?.type !== 'pad') return;
  let { raw, negative } = current;
  if (key === 'del') raw = raw.slice(0, -1);
  else if (key === 'clear') raw = '';
  else if (key === 'sign') negative = !negative;
  else if (raw.length + key.length <= 6) raw = raw === '' && key.startsWith('0') ? '' : raw + key;
  modal.value = { type: 'pad', raw, negative };
}

function onIntent(intent: WindIntent) {
  const g = game.value;
  if (!g) return;
  if (intent.startsWith('pad:')) {
    pressPad(intent.slice(4));
    return;
  }
  switch (intent) {
    case 'toggle-score':
      scoreMode.value = scoreMode.value === 'diff' ? 'absolute' : 'diff';
      return;
    case 'riichi':
      if (g.riichi[myId.value]) {
        confirm('取消立直', '把 1000 从供托拿回来。', '取消立直', { type: 'action:cancel-riichi' });
      } else {
        confirm('立直', '立刻 −1000，供托 +1000。', '立直', { type: 'action:riichi' });
      }
      return;
    case 'settle':
      modal.value = { type: 'wizard', step: 'kind', kind: 'win', dealerLocked: dealerLocked() };
      return;
    case 'wizard-win':
      modal.value = { type: 'wizard', step: 'flag', kind: 'win', dealerLocked: dealerLocked() };
      return;
    case 'wizard-draw':
      modal.value = { type: 'wizard', step: 'flag', kind: 'draw', dealerLocked: dealerLocked() };
      return;
    case 'wizard-yes':
    case 'wizard-no': {
      const current = modal.value;
      if (current?.type !== 'wizard') return;
      if (intent === 'wizard-no' && current.kind === 'draw' && current.dealerLocked) return;
      startSettle(current.kind, intent === 'wizard-yes');
      return;
    }
    case 'wizard-back':
      if (modal.value?.type === 'wizard' && modal.value.step === 'flag') {
        modal.value = { ...modal.value, step: 'kind' };
      } else closeModal();
      return;
    case 'undo-hand':
      confirm('撤销本局', '恢复本局开始时的点数和供托，本局的立直和结算作废。', '撤销本局', {
        type: 'action:undo-hand',
      });
      return;
    case 'back-hand':
      confirm('回到上一局', '本局作废，回到上一局入分后的画面，可以撤销或重新选择下一步。', '回到上一局', {
        type: 'action:back-hand',
      });
      return;
    case 'next-hand':
      void act({ type: 'action:next-hand' });
      return;
    case 'end-match':
      confirm('结束对局', '按当前点数结算整场对局，剩余供托归一位。结束后不能再撤销或继续。', '结束对局', {
        type: 'action:end-match',
      });
      return;
    case 'no-change':
      submitScore(0);
      return;
    case 'fill':
      modal.value = { type: 'pad', raw: '', negative: false };
      return;
    case 'pad-zero':
      submitScore(0);
      return;
    case 'pad-ok': {
      const current = modal.value;
      if (current?.type !== 'pad') return;
      submitScore(Number(current.raw || 0) * (current.negative ? -1 : 1));
      return;
    }
    case 'cancel-settle':
      confirm('取消结算', '四家已填的分数作废，回到本局继续打。', '取消结算', { type: 'action:settle-cancel' });
      return;
    case 'confirm-ok': {
      const action = pendingConfirm;
      closeModal();
      if (action) void act(action);
      return;
    }
    case 'modal-close':
      closeModal();
      return;
  }
}

function sceneState(): WindSceneState {
  return {
    view: view.value,
    myId: myId.value,
    scoreMode: scoreMode.value,
    modal: modal.value,
    notice: notice.value,
    noticeIsError: Boolean(notice.value) || Boolean(game.value?.settle?.error),
    connecting: connection.value !== 'open',
  };
}

function fitScene(hostEl: HTMLElement) {
  const width = WindScene.fitWidth(hostEl.clientWidth || 320, hostEl.clientHeight, modal.value);
  scene.value?.resize(width);
}

// 别人推进了阶段时，收起已经不适用的弹窗
watch(
  () => game.value?.phase,
  (phase) => {
    const current = modal.value;
    if (!current) return;
    if (current.type === 'wizard' && phase !== 'playing') closeModal();
    if (current.type === 'pad' && phase !== 'settling') closeModal();
    if (current.type === 'confirm' && pendingConfirm?.type === 'action:end-match' && phase !== 'handEnd') closeModal();
    if (current.type === 'confirm' && phase === 'finished') closeModal();
  },
);

watch(sceneState, (state) => {
  scene.value?.setState(state);
  const hostEl = host.value;
  if (hostEl) fitScene(hostEl);
});

onMounted(async () => {
  if (!code.value) {
    loadError.value = '缺少房间信息';
    loading.value = false;
    return;
  }
  try {
    view.value = await fetchWindRoom(code.value);
  } catch (err) {
    loadError.value = messageOf(err) ?? '加载对局失败';
  } finally {
    loading.value = false;
  }
  if (auth.token) {
    socket = createWindSocket({
      code: code.value,
      token: auth.token,
      onUpdate: (next) => {
        view.value = next;
      },
      onError: flash,
      onStatus: (state) => {
        connection.value = state;
      },
    });
  }

  const canvasEl = canvas.value;
  const hostEl = host.value;
  if (!canvasEl || !hostEl) return;
  try {
    const created = await WindScene.create(canvasEl);
    if (disposed) {
      created.destroy();
      return;
    }
    created.setIntentHandler(onIntent);
    scene.value = created;
    fitScene(hostEl);
    created.setState(sceneState());
    observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width <= 0) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const hostNow = host.value;
        if (hostNow) fitScene(hostNow);
      });
    });
    observer.observe(hostEl);
  } catch (error) {
    console.error('[mahjong-wind] PixiJS 场景初始化失败', error);
    sceneError.value = '画面加载失败，请刷新后重试';
  }
});

onBeforeUnmount(() => {
  disposed = true;
  socket?.close();
  socket = null;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  observer?.disconnect();
  scene.value?.destroy();
  scene.value = null;
});
</script>

<template>
  <div class="wind">
    <p v-if="loading" class="muted">加载对局中…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <div v-show="!loading && !loadError" ref="host" class="stage">
      <canvas ref="canvas"></canvas>
    </div>
    <p v-if="sceneError" class="error">{{ sceneError }}</p>
  </div>
</template>

<style scoped>
.wind {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stage {
  flex: 1;
  min-height: 0;
  width: min(100%, 460px);
  margin: 0 auto;
  overflow: hidden;
}
.stage canvas {
  display: block;
  margin: 0 auto;
  width: 100%;
  height: auto;
  touch-action: manipulation;
}
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}
</style>
