# 调研：比谁画得更像

调研日期：2026-11-05。尚未立项为正式游戏，没有 `gameId`。实现时再按 `docs/games/<gameId>.md` 写开发说明。

目标玩法：1～8 人。每轮给出一张样图，玩家各自绘画，比较谁画得更像。也可对照样图的文字描述，看画的内容是否符合。

现有「你画我猜」已有画布、笔画同步和 2～8 人房间，本玩法可复用绘制层。新能力是**评分**。

线上机器大约 1 核 / 458MB 内存，不能在这台机上加载 CLIP 一类模型。

## 问题本质

难点不是「两张图像素像不像」，而是样图往往是照片或彩色图，玩家画的是线稿。跨风格时，像素级算法几乎不可用。

## 不适合当主裁判

| 方法 | 库 | 适合什么 | 为什么不适合这局 |
|---|---|---|---|
| 均方误差 / 逐像素 | 自己算 | 几乎对齐的同一张图 | 画偏一点、粗细不同，分数就崩 |
| SSIM | `ssim.js` | 压缩、模糊后的同一张照片 | 和「画得像不像」的人工分相关很弱 |
| 感知哈希 pHash / dHash | `sharp-phash`、`@claudiu-ceia/dhash` | 查近重复、缩略图 | 只看整体明暗结构，认不出「都是猫」 |
| LPIPS | 多为 Python | 生成图和原图是否观感接近 | 同样吃对齐和纹理，线稿对照片不行 |

这些可以当调试工具（确认导出的 PNG 没坏），不能当排名依据。

## 适合的方法：语义向量 + 余弦相似度

CLIP 一类模型把图和文映射到同一空间。分数是两个向量的余弦相似度，大约 −1～1，实际画作多在 0.1～0.4。**同一轮里的相对名次比绝对值更稳。**

草稿检索照片的公开对比：CLIP ViT-B/32 的 Recall@10 大约 61%，ImageNet 的 ResNet-50 大约 16%。CLIP 学的是「这是什么」，不是「像素怎么铺」。

建议保留两路分数，方便调权重：

1. **图对图**：样图向量 · 玩家画向量。回答「画的是不是这张样图」。
2. **文对图**：样图说明（如「一只侧身的橘猫」）· 玩家画向量。回答「画的内容对不对」。说明是中文时，英文 CLIP 会偏弱。

计分不要把原始余弦直接当百分制。同一轮把各人相似度做相对排名（最高 100、其余按差距拉开）。

## 本机开源库（适合实验，不适合当前生产机）

- [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers)（Transformers.js）
  - 图对图 / 英文说明：`Xenova/clip-vit-base-patch32`
  - 中文说明：`Xenova/chinese-clip-vit-base-patch16`（[OFA-Sys Chinese-CLIP](https://github.com/OFA-Sys/Chinese-CLIP) 的 ONNX）
  - 可在 Node 或浏览器跑。量化后视觉侧大约 150～200MB，放不进当前 458MB 服务器。
- 浏览器本机算分可以用于单人练习，多人公平局不能信客户端分数。

参考：

- Transformers.js CLIP 用法：`CLIPVisionModelWithProjection` + `cos_sim`
- Chinese-CLIP ONNX：https://huggingface.co/Xenova/chinese-clip-vit-base-patch16
- 草稿对照片检索对比：https://github.com/RudraSomaiya/sketch-to-photo-retrieval
- Sketch 评测里 SSIM / LPIPS 与人工结构分相关弱：SketchRef (arXiv 2408.08623)

## 远程 API（适合线上裁判）

- **Gemini Embedding 2**（`gemini-embedding-2`）：图和文进同一空间，再算余弦。有免费额度，Node 可调。当前最省事、又不用自建 GPU。
- **视觉对话模型**（Gemini Flash、GPT-4o、Qwen-VL 等）：样图和玩家画一起送进去，打 0～100 并写理由。更像真人评委，但慢、贵、同一套画重评可能差几分。
- OpenAI **没有**官方 CLIP 图像向量接口，只有文本 embedding。不要按「OpenAI CLIP API」去接。
- 也可把开源 CLIP 放到 Hugging Face / Replicate / 硅基流动当推理服务，按次计费。

## 不必上的方案

- 关键点 / 姿态（SketchRef 那套）：只对人和动物骨架有用，实现重。
- 自训 sketch–photo 检索模型：效果可以更好，工作量远超一款小游戏。

## 结合本仓库的落地建议

- 对局画布复用「你画我猜」的笔画同步；结束时把画布导出成 PNG 再评分。
- **1 人练习**：浏览器加载量化 CLIP，本机出分，服务器只记分。
- **2～8 人排名**：必须在服务端评分。这台小机器不要载模型，用 Gemini 一类 embedding API，或单独的推理服务。每轮最多 8 张小图，延迟一般能压在几秒内。
- 样图尽量主体清晰、背景干净；说明写具体（「一杯带把手的马克杯」比「杯子」好评）。中文说明用中文 CLIP 或 Gemini。

## 第一版建议（待确认后再做）

图对图为主、中文说明为辅；服务端调 Gemini embedding（或同类接口）；本地用 Transformers.js 做对照实验。

实现前需要定：

1. 评分走 **API**，还是接受 **仅练习局本地算**。
2. 样图是 **照片**、**简笔画**，还是两种都要。
