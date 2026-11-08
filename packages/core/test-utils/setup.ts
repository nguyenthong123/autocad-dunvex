// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { beforeEach } from "@rstest/core";
import { initializeI18n } from "./i18n";

// Rstest global setup file — loaded once per worker via `setupFiles` in rstest.config.ts.
// Registers the identity locale so tests never log "No translation for ... in undefined"
// without each test file having to call `initializeI18n()` itself.
initializeI18n();

if (typeof (Promise as any).try !== "function") {
    (Promise as any).try = (fn: any, ...args: any[]) => new Promise((resolve) => resolve(fn(...args)));
}

// TASK-40 localStorage ticket, follow-up hardening. The mock's install/restore pair is
// now ownership-based, but a worker realm shared by ~700 files can still have its
// `localStorage` binding deleted by some future careless file, and every later test in
// that worker dies with "Cannot read properties of undefined (reading 'getItem')"
// (exactly the flake `hermes verify` reproduced twice). Guard the test boundary:
// if the realm lost a usable storage at the start of any test, hand back a fresh
// in-memory one. Healthy bindings are never touched.
function repairLocalStorageRealm(): void {
    const current = (global as any).localStorage;
    if (current && typeof current.getItem === "function" && typeof current.setItem === "function") return;
    const data: Record<string, string> = {};
    Object.defineProperty(global, "localStorage", {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => data[key] ?? null,
            setItem: (key: string, value: string) => {
                data[key] = String(value);
            },
            removeItem: (key: string) => {
                delete data[key];
            },
            clear: () => {
                for (const k of Object.keys(data)) delete data[k];
            },
            get length() {
                return Object.keys(data).length;
            },
            key: (index: number) => Object.keys(data)[index] ?? null,
        },
    });
}

beforeEach(repairLocalStorageRealm);
