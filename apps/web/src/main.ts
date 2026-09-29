import { createPlatformApp } from '@game-life/platform-web';
import { bingoWebPlugin } from '@game-life/game-bingo/web';
import { pokerMemoryWebPlugin } from '@game-life/game-poker-memory/web';

createPlatformApp({
  games: [pokerMemoryWebPlugin, bingoWebPlugin],
});
