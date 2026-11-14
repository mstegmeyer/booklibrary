import type { Page } from "@playwright/test";

type Options = {
  /** What `startScan` does: run, or fail as the shell does. */
  camera?: "granted" | "denied" | "unavailable";
  torch?: boolean;
};

type Message = { action: string; on?: boolean; light?: boolean };
type State = {
  calls: Message[];
  scanning: boolean;
  torch: boolean;
  lightStatusBar: boolean;
};

/**
 * Stands in for the iOS shell (see apps/web/src/lib/app-shell.ts) before the
 * page loads, so the web app believes it runs in the app. It records every
 * bridge call and lets the test report barcodes.
 */
export async function installFakeShell(page: Page, options: Options = {}) {
  await page.addInitScript(({ camera = "granted", torch = true }: Options) => {
    const state: State = {
      calls: [],
      scanning: false,
      torch: false,
      lightStatusBar: false,
    };
    const answer = (message: Message) => {
      switch (message.action) {
        case "startScan":
          if (camera !== "granted") throw new Error(camera);
          state.scanning = true;
          return;
        case "stopScan":
          state.scanning = false;
          state.torch = false;
          return;
        case "checkTorch":
          if (!torch) throw new Error("unavailable");
          return;
        case "setTorch":
          if (!torch || !state.scanning) throw new Error("unavailable");
          state.torch = message.on === true;
          return;
        case "setLightStatusBar":
          state.lightStatusBar = message.light === true;
          return;
      }
    };
    Object.defineProperty(window, "fakeShell", { value: state });
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          bookLibrary: {
            postMessage: async (message: Message) => {
              state.calls.push(message);
              answer(message);
              return null;
            },
          },
        },
      },
    });
  }, options);

  return {
    /** Reports a barcode as the camera would. */
    scan: (code: string) =>
      page.evaluate((code) => {
        window.dispatchEvent(
          new CustomEvent("booklibrary:barcode", { detail: code }),
        );
      }, code),
    state: () =>
      page.evaluate(
        () => (window as unknown as { fakeShell: State }).fakeShell,
      ),
  };
}
