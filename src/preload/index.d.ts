import type { RendererApi } from '@shared/ipcChannels';

export {};

declare global {
  interface Window {
    api: RendererApi;
    menuEvents: {
      onCommand: (cb: (command: string) => void) => () => void;
    };
  }
}
