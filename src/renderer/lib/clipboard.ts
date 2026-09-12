/** Copies via Electron's native clipboard module (main process, through window.api) —
 *  not the renderer's web Clipboard API, which is subject to browser permission
 *  policies that behave inconsistently across contexts. Falls back to the web API
 *  only when running outside Electron (the browser-preview dev mode). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (window.api?.clipboard) {
      await window.api.clipboard.writeText(text);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
