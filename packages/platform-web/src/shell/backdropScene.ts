import { Application, Container, FillGradient, Graphics, Ticker } from 'pixi.js';

interface Star {
  node: Graphics;
  nx: number;
  ny: number;
  speed: number;
  phase: number;
}

export function createBackdrop(app: Application) {
  const sky = new Graphics();
  const wash = new Graphics();
  const orbA = new Graphics();
  const orbB = new Graphics();
  const stars = new Container();
  const root = new Container();
  root.addChild(sky, wash, orbA, orbB, stars);

  const skyFill = new FillGradient({
    colorStops: [
      { offset: 0, color: 0x24143a },
      { offset: 0.46, color: 0x10182e },
      { offset: 1, color: 0x070d16 },
    ],
  });
  const washFill = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.22 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.35 },
    outerRadius: 0.7,
    colorStops: [
      { offset: 0, color: 0xf0c36a },
      { offset: 0.22, color: 0x3d2d62 },
      { offset: 1, color: 0x000000 },
    ],
  });

  orbA.circle(0, 0, 150).fill({ color: 0x6a4bff, alpha: 0.16 });
  orbB.circle(0, 0, 120).fill({ color: 0xf0c36a, alpha: 0.1 });

  const starData: Star[] = Array.from({ length: 42 }, () => {
    const node = new Graphics();
    const radius = 0.7 + Math.random() * 1.5;
    const gold = Math.random() > 0.78;
    node.circle(0, 0, radius).fill({ color: gold ? 0xf0c36a : 0xf7f4ea, alpha: 0.55 });
    stars.addChild(node);
    return {
      node,
      nx: Math.random(),
      ny: Math.random(),
      speed: 0.00035 + Math.random() * 0.0007,
      phase: Math.random() * Math.PI * 2,
    };
  });

  let width = 0;
  let height = 0;

  function layout() {
    const nextWidth = app.screen.width;
    const nextHeight = app.screen.height;
    if (nextWidth < 1 || nextHeight < 1 || (nextWidth === width && nextHeight === height)) return;
    width = nextWidth;
    height = nextHeight;
    sky.clear();
    sky.rect(0, 0, width, height).fill(skyFill);
    wash.clear();
    wash.rect(0, 0, width, height).fill({ fill: washFill, alpha: 0.2 });
  }

  let time = 0;
  function tick(ticker: Ticker) {
    layout();
    time += ticker.deltaMS;
    for (const star of starData) {
      star.ny -= star.speed * ticker.deltaMS;
      if (star.ny < 0) star.ny += 1;
      star.node.position.set(star.nx * width, star.ny * height);
      star.node.alpha = 0.3 + (Math.sin(time * 0.002 + star.phase) + 1) * 0.35;
    }
    orbA.position.set(width * 0.18 + Math.sin(time * 0.00025) * 28, height * 0.2);
    orbB.position.set(width * 0.84 + Math.cos(time * 0.0002) * 22, height * 0.74);
  }

  return { root, tick };
}
