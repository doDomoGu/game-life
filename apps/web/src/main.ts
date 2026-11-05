import { createPlatformApp } from '@game-life/platform-web';
import { bingoWebPlugin } from '@game-life/game-bingo/web';
import { colorGuessWebPlugin } from '@game-life/game-color-guess/web';
import { drawGuessWebPlugin } from '@game-life/game-draw-guess/web';
import { hanabiWebPlugin } from '@game-life/game-hanabi/web';
import { pokerMemoryWebPlugin } from '@game-life/game-poker-memory/web';
import { klotskiWebPlugin } from '@game-life/game-klotski/web';
import { sudokuWebPlugin } from '@game-life/game-sudoku/web';
import { mahjongWindWebPlugin } from '@game-life/game-mahjong-wind/web';
import { mahjongScoreWebPlugin } from '@game-life/game-mahjong-score/web';

createPlatformApp({
  games: [
    pokerMemoryWebPlugin,
    bingoWebPlugin,
    hanabiWebPlugin,
    drawGuessWebPlugin,
    colorGuessWebPlugin,
    sudokuWebPlugin,
    klotskiWebPlugin,
    mahjongWindWebPlugin,
    mahjongScoreWebPlugin,
  ],
});
