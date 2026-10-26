import type { InjectionKey, Ref } from 'vue';

/** True while a room is in a match or showing that match's settlement. */
export const SHELL_MATCH_KEY: InjectionKey<Ref<boolean>> = Symbol('shell-match');
