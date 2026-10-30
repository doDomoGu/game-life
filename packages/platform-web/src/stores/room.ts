import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchRooms, type RoomView } from '../api/rooms.js';

/** 路由守卫每次切换都会问一次，1.5 秒内复用结果，避免连续跳转打满接口 */
const FRESH_MS = 1500;

export const useRoomStore = defineStore('room', () => {
  const mine = ref<RoomView | null>(null);
  let loadedAt = 0;
  let inflight: Promise<RoomView | null> | null = null;

  async function refresh(force = false): Promise<RoomView | null> {
    if (!force && Date.now() - loadedAt < FRESH_MS) return mine.value;
    if (inflight) return inflight;
    inflight = fetchRooms()
      .then((data) => {
        mine.value = data.mine;
        loadedAt = Date.now();
        return mine.value;
      })
      .catch(() => mine.value)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  function clear() {
    mine.value = null;
    loadedAt = Date.now();
  }

  return { mine, refresh, clear };
});
