/**
 * Bridge to the native app shell (`apps/ios`), which shows this web interface
 * in a web view. In a browser `isInApp` is false and every call rejects.
 *
 * Scanning:
 * - `startScan()` resolves once the camera runs. The camera fills the screen
 *   *behind* the web view, so while scanning the page must make `html`, `body`
 *   and anything else covering the screen transparent where the camera should
 *   show. It rejects with an `Error` whose message is a `ScanError`:
 *   `"denied"` when camera access was refused (it can only be granted again in
 *   the Settings app) or `"unavailable"` when there is no camera (simulator).
 * - `onBarcode(listener)` receives the digits of each recognised EAN-13 or
 *   EAN-8 barcode (ISBN-13 included) and returns a function that unsubscribes.
 *   A code that stays in view is reported once; it is reported again after it
 *   has been out of view for 1.5 seconds.
 * - `stopScan()` turns the camera off and the web view opaque again. Call it
 *   when the scan screen closes; the shell only stops by itself when a page
 *   loads.
 *
 * `changeServer()` leaves the web interface for the shell's connect screen.
 */
export type ScanError = "denied" | "unavailable";

type Action = "changeServer" | "startScan" | "stopScan";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        bookLibrary?: {
          postMessage(message: { action: Action }): Promise<unknown>;
        };
      };
    };
  }
}

const handler = window.webkit?.messageHandlers?.bookLibrary;

export const isInApp = handler !== undefined;

async function call(action: Action): Promise<void> {
  if (!handler) throw new Error("unavailable" satisfies ScanError);
  await handler.postMessage({ action });
}

export const changeServer = () => call("changeServer");
export const startScan = () => call("startScan");
export const stopScan = () => call("stopScan");

export function onBarcode(listener: (code: string) => void): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<string>).detail);
  window.addEventListener("booklibrary:barcode", handle);
  return () => window.removeEventListener("booklibrary:barcode", handle);
}
