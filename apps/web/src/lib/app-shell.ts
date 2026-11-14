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
 * Torch:
 * - `checkTorch()` resolves when the device has a torch and rejects with
 *   `"unavailable"` when it has none (simulator).
 * - `setTorch(on)` switches the torch on or off while scanning. It rejects with
 *   `"unavailable"` when there is no torch or no scan is running. Stopping the
 *   scan turns the torch off, so every scan starts with it off.
 *
 * Status bar:
 * - `setLightStatusBar(light)` shows the clock and icons above the page light,
 *   for a screen that is dark at the top, or dark again. Loading a page makes
 *   them dark.
 *
 * `changeServer()` leaves the web interface for the shell's connect screen.
 */
export type ScanError = "denied" | "unavailable";

type Message =
  | { action: "changeServer" | "startScan" | "stopScan" | "checkTorch" }
  | { action: "setTorch"; on: boolean }
  | { action: "setLightStatusBar"; light: boolean };

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        bookLibrary?: {
          postMessage(message: Message): Promise<unknown>;
        };
      };
    };
  }
}

const handler = window.webkit?.messageHandlers?.bookLibrary;

export const isInApp = handler !== undefined;

async function call(message: Message): Promise<void> {
  if (!handler) throw new Error("unavailable" satisfies ScanError);
  await handler.postMessage(message);
}

export const changeServer = () => call({ action: "changeServer" });
export const startScan = () => call({ action: "startScan" });
export const stopScan = () => call({ action: "stopScan" });
export const checkTorch = () => call({ action: "checkTorch" });
export const setTorch = (on: boolean) => call({ action: "setTorch", on });
export const setLightStatusBar = (light: boolean) =>
  call({ action: "setLightStatusBar", light });

export function onBarcode(listener: (code: string) => void): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<string>).detail);
  window.addEventListener("booklibrary:barcode", handle);
  return () => window.removeEventListener("booklibrary:barcode", handle);
}
