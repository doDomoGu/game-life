/** 把页面高度锁在当前可见区域，避开 iOS 浏览器底部地址栏和工具栏。 */
export function installBrowserChrome(): void {
  const apply = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
  };
  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', apply);
}
