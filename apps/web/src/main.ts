import { createPlatformApp } from '@game-life/platform-web';
import { bingoWebPlugin } from '@game-life/game-bingo/web';
import { drawGuessWebPlugin } from '@game-life/game-draw-guess/web';
import { hanabiWebPlugin } from '@game-life/game-hanabi/web';
import { pokerMemoryWebPlugin } from '@game-life/game-poker-memory/web';

createPlatformApp({
  games: [pokerMemoryWebPlugin, bingoWebPlugin, hanabiWebPlugin, drawGuessWebPlugin],
});
