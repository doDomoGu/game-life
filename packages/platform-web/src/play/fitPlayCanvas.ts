/** 把对局画布按比例放进宿主剩余区域，避免手机底栏和安全区裁切。 */
export function playCanvasScale(
  availableWidth: number,
  availableHeight: number,
  layoutWidth: number,
  layoutHeight: number,
): number {
  if (layoutWidth <= 0 || layoutHeight <= 0) return 1;
  const width = Math.max(1, availableWidth);
  const height = Math.max(1, availableHeight);
  return Math.min(width / layoutWidth, height / layoutHeight, 1);
}

export function applyPlayCanvasSize(
  canvas: HTMLCanvasElement,
  layoutWidth: number,
  layoutHeight: number,
  scale: number,
): void {
  canvas.style.width = `${Math.max(1, Math.floor(layoutWidth * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(layoutHeight * scale))}px`;
}

export function fitPlayCanvas(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  layoutWidth: number,
  layoutHeight: number,
): number {
  const scale = playCanvasScale(
    host.clientWidth,
    host.clientHeight,
    layoutWidth,
    layoutHeight,
  );
  applyPlayCanvasSize(canvas, layoutWidth, layoutHeight, scale);
  return scale;
}
