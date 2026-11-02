// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createRequire } from "node:module";
import { GlobalWindow } from "happy-dom";

// Ignore css imports in Node runtime
const require = createRequire(import.meta.url);
if (require.extensions) {
    require.extensions[".css"] = (module: any) => {
        module.exports = new Proxy(
            {},
            {
                get: (_target, prop) => String(prop),
            },
        );
    };
}

const happyWindow = new GlobalWindow();
for (const prop of Object.getOwnPropertyNames(happyWindow)) {
    if (!(prop in globalThis)) {
        try {
            (globalThis as any)[prop] = (happyWindow as any)[prop];
        } catch {
            // Read-only or getter without setter
        }
    }
}
(globalThis as any).window = globalThis;
(globalThis as any).document = happyWindow.document;
(globalThis as any).HTMLElement = happyWindow.HTMLElement;
(globalThis as any).customElements = happyWindow.customElements;

(globalThis as any).__APP_VERSION__ = "0.8.0";
(globalThis as any).__DOCUMENT_VERSION__ = "0.7.1";
(globalThis as any).__IS_PRODUCTION__ = false;

if (typeof (Promise as any).try !== "function") {
    (Promise as any).try = (fn: any, ...args: any[]) => new Promise((resolve) => resolve(fn(...args)));
}
