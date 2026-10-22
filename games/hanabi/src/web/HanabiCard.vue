<script setup lang="ts">
import { computed } from 'vue';
import type { CardView } from '../view.js';
import { COLOR_LABELS, type Color } from '../colors.js';

const props = withDefaults(
  defineProps<{
    card: CardView;
    hidden?: boolean;
    selected?: boolean;
    disabled?: boolean;
    highlight?: boolean;
  }>(),
  { hidden: false, selected: false, disabled: false, highlight: false },
);

defineEmits<{ (event: 'select'): void }>();

const isHidden = computed(() => props.hidden || (!props.card.color && !props.card.value));

const colorClass = computed<Color | 'unknown'>(() =>
  isHidden.value ? ((props.card.hints?.color as Color) ?? 'unknown') : (props.card.color as Color),
);

const isHinted = computed(
  () => props.highlight || Boolean(props.card.hints?.color || props.card.hints?.value),
);
</script>

<template>
  <button
    type="button"
    class="hanabi-card"
    :class="[colorClass, { selected, hidden: isHidden, hinted: isHinted }]"
    :disabled="disabled"
    @click="$emit('select')"
  >
    <template v-if="isHidden">
      <span class="back">?</span>
      <span v-if="card.hints?.color" class="tag tag--color">{{ COLOR_LABELS[card.hints.color] }}</span>
      <span v-if="card.hints?.value" class="tag tag--value">{{ card.hints.value }}</span>
    </template>
    <template v-else>
      <span class="rank">{{ card.value }}</span>
      <span class="suit">{{ card.color ? COLOR_LABELS[card.color] : '?' }}</span>
    </template>
  </button>
</template>

<style scoped>
.hanabi-card {
  width: 54px;
  height: 78px;
  border-radius: 11px;
  border: 2px solid rgba(255, 255, 255, 0.16);
  background: #1a2d45;
  color: #fff;
  display: grid;
  place-items: center;
  position: relative;
  padding: 0;
  cursor: pointer;
  flex: 0 0 auto;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.hanabi-card.selected {
  outline: 2px solid var(--accent);
  transform: translateY(-4px);
}

.hanabi-card.hinted {
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.75), 0 8px 16px rgba(0, 0, 0, 0.28);
}

.hanabi-card:disabled {
  cursor: default;
}

.rank {
  font-size: 26px;
  font-weight: 800;
  line-height: 1;
}

.suit {
  font-size: 12px;
  opacity: 0.9;
}

.back {
  font-size: 24px;
  font-weight: 700;
  opacity: 0.7;
}

.tag {
  position: absolute;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
}

.tag--color {
  top: 5px;
  left: 5px;
}

.tag--value {
  bottom: 5px;
  right: 5px;
}

.red {
  background: linear-gradient(160deg, #7a2430, #c94b57);
}

.yellow {
  background: linear-gradient(160deg, #7a5d14, #d2ad3a);
  color: #1b1404;
}

.green {
  background: linear-gradient(160deg, #1f5a39, #3fad6b);
}

.blue {
  background: linear-gradient(160deg, #1d4578, #3f7fd0);
}

.white {
  background: linear-gradient(160deg, #d7dde6, #f7f8fa);
  color: #243041;
}

.unknown {
  background: linear-gradient(160deg, #243448, #1a2d45);
}
</style>
