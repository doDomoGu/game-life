/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vite 注入的部署基础路径，例如 /game-life/ */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
