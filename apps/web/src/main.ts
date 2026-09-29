import { createPlatformApp } from '@game-life/platform-web';
import { pokerMemoryWebPlugin } from '@game-life/game-poker-memory/web';

createPlatformApp({
  games: [pokerMemoryWebPlugin],
});
