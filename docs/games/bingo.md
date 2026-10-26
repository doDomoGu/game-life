# Bingo

房间内的多人对战。房主在房间里选中本游戏并开始；人数不足或超出时不能开始。登录、房间成员、对局状态、结束后的「退出游戏」走平台底座。图案板、开奖和胜负放在本游戏自己的会话里。

- **gameId**: `bingo`
- **人数**: 最少 1，最多 8（`minPlayers = 1`，`maxPlayers = 8`）
- **棋盘**: 5×5，共 25 格
- **图案**: 25 种，与格子一一对应，定义在 `games/bingo/src/items.ts`
- **历史 `recordStyle`**: `match`。`rawScore` 胜为 1、负为 0，`meta.won` 为布尔值

## 开局

`onStart` 调用 `beginSession`。当时在房间里的每位玩家各得一张随机板：25 个图案的一个排列。每人格子初始都不点亮。开奖池是这 25 个图案的另一个随机顺序，全房间共用。

玩家顺序就是房间里的玩家顺序。同一轮里多人同时连成一线时，顺序靠前的人记为获胜者。

## 揭晓

只有房主可以揭晓。每次从开奖池取出一个图案，所有人板上等于该图案的格子点亮。

横、竖、两条斜线共 **12 条线**，任一线 5 格全亮即获胜。线的下标在 `games/bingo/src/lines.ts`。第一次出现获胜者时：

- 对局标记为结束，不能再揭晓
- 每位玩家写一条历史：`meta.kind = 'bingo'`，带 `roomCode`、`won`、`opponents`
- 调用平台 `finishRoom`，房间进入结算

25 种图案都揭晓后仍没有线，开奖池为空，房主不能再揭晓，对局停在进行中。

其他人每 **2 秒** 轮询 `GET /api/games/bingo/rooms/:code`。房主揭晓走 `POST /api/games/bingo/rooms/:code/draw`。没有 WebSocket。

## 界面

对局画面是 `games/bingo/src/web/Room.vue`，棋盘由 PixiJS 画在 `games/bingo/src/web/scene/BingoScene.ts`。自己的板、已揭晓图案和获胜线画在这块画布上。房主看到「揭晓下一个图案」；其他人看到「等待房主开奖」。有获胜者时显示其用户名。

结算之后由玩家点击平台的「退出游戏」，房间回到等待，玩家和当前所选游戏都保留。

## 代码落点

独立包 `games/bingo/`，在 `apps/web` 与 `apps/server` 注册插件。

- `src/server/engine.ts`：发牌、开奖池、点亮、判胜
- `src/server/rooms.ts`：内存会话、写历史、结束平台房间
- `src/server/routes.ts`：查询与开奖 HTTP
- `src/web/scene/BingoScene.ts`：棋盘绘制

会话存在服务端进程内存里。进程重启后进行中的 Bingo 对局消失。
