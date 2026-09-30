const DESKTOP_WIDTH = 1280;
const ROOT_FONT_SIZE_PX = 16;

let viewportWidth = DESKTOP_WIDTH;

/** Emulates a viewport width for `min-width` media queries (jsdom has no layout engine). */
export function setViewportWidth(width: number): void {
  viewportWidth = width;
}

export function resetViewport(): void {
  viewportWidth = DESKTOP_WIDTH;
}

export function installMatchMedia(): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const minWidth = /min-width:\s*([\d.]+)(px|rem)/.exec(query);
    const minWidthPx = minWidth
      ? Number(minWidth[1]) * (minWidth[2] === 'rem' ? ROOT_FONT_SIZE_PX : 1)
      : undefined;
    return {
      matches: minWidthPx !== undefined && viewportWidth >= minWidthPx,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  };
}
