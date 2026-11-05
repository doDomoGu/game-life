# 立直麻将 · 点数练习

房间内的单人游戏。房主在房间里选中本游戏并开始。登录、房间成员、对局状态、结束后的「退出游戏」走平台底座。出题、作答和计时在浏览器里完成，服务端只校验成绩。

- **gameId**: `mahjong-score`
- **人数**: 1（`minPlayers = 1`，`maxPlayers = 1`）
- **历史 `recordStyle`**: `score`。`rawScore` 为答对题数，越多越好

牌面 SVG 来自 [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)，CC0，见 `games/mahjong-score/assets/tiles/LICENSE.md`。玩法移植自独立站 `/mahjong/score-practice/`。

## 题量

开始后先选题量，再出题：

| 按钮 | 题数 |
|---|---|
| 1 题 | 1 |
| 5 题 | 5 |
| 10 题 | 10 |

题目在浏览器里即时生成，不经过服务端。每题随机平和、断幺九、一气通贯或役牌之一，并附带立直、一发、门清自摸、本场 0～3、宝牌/里宝牌和赤宝牌。

## 作答

对局内容用 PixiJS 画：手牌 13 张（万筒条字排序）、和了牌、宝牌指示牌、里宝牌。画面会按房间剩余可视区域等比缩放，避免手机底栏裁掉提交按钮。先填符数和番数，再填应付点数：

- 荣和：点炮者支付
- 亲家自摸：三家各支付
- 子家自摸：子家各支付、庄家支付

提交后立刻对照答案。全部做完写入成绩。

## 成绩

- `rawScore`：答对题数，范围 0～10
- `durationMs`：整局毫秒
- `meta.kind = 'mahjong-score'`，`meta.total` 为题量，`meta.correct` 为答对题数

服务端 `validateSubmit` 只检查分数和用时范围。房间内完成后调用平台 `complete()`。独立打开 `/game/mahjong-score/play` 时，完成后可以「再来一局」。

## 代码落点

独立包 `games/mahjong-score/`，在 `apps/web` 与 `apps/server` 注册插件。没有 `onStart`，也没有自己的 HTTP 或 WebSocket。

- `src/generate.ts`：四种牌型出题
- `src/fu.ts` / `src/points.ts` / `src/yaku.ts`：符、翻、点数
- `src/rules.ts`：成绩校验
- `src/web/Play.vue`：题量、作答、提交
- `src/web/scene/ScoreScene.ts`：PixiJS 选题量、牌面和数字键盘
