// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// The install/restore pair must leave the realm exactly as it was found: earlier
// versions defined `localStorage` without `configurable` (locking the property for
// the whole worker) and tests then reset it to `undefined`, so any file scheduled
// next in the same worker hit "Cannot read properties of undefined".
// Contract v2 (ticket reopened after `hermes verify` still reddened batchBGovernance):
// the capture is OWNERSHIP-based, not first-time. Whenever the realm stops holding
// exactly our installed mock (another file's leftover, a foreign delete, a fresh
// module instance), the next install re-captures the current descriptor, and a
// restore only ever rewinds a binding we still own — it can no longer delete
// happy-dom's storage that it never installed.
let installedMock: unknown;
let savedDescriptor: PropertyDescriptor | undefined;

const weOwnTheBinding = () =>
    installedMock !== undefined &&
    Object.getOwnPropertyDescriptor(global, "localStorage")?.value === installedMock;

export const mockLocalStorage = () => {
    if (!weOwnTheBinding()) {
        savedDescriptor = Object.getOwnPropertyDescriptor(global, "localStorage");
    }
    const localStorageData: Record<string, string> = {};
    const localStorage = new Proxy(
        {
            getItem: (key: string) => localStorageData[key] ?? null,
            setItem: (key: string, value: string) => {
                localStorageData[key] = value;
            },
            removeItem: (key: string) => delete localStorageData[key],
            clear: () => {
                Object.keys(localStorageData).forEach((k) => delete localStorageData[k]);
            },
            get length() {
                return Object.keys(localStorageData).length;
            },
            key: (index: number) => Object.keys(localStorageData)[index] ?? null,
        },
        {
            get: (target, prop) => {
                if (prop === "getItem") return target.getItem;
                if (prop === "setItem") return target.setItem;
                if (prop === "removeItem") return target.removeItem;
                if (prop === "clear") return target.clear;
                if (prop === "length") return target.length;
                if (prop === "key") return target.key;
                return target.getItem(prop as string);
            },
            set: (target, prop, value) => {
                target.setItem(prop as string, value);
                return true;
            },
            ownKeys: () => Object.keys(localStorageData),
            getOwnPropertyDescriptor: (_target, prop) => {
                if (typeof prop === "string" && prop in localStorageData) {
                    return {
                        value: localStorageData[prop],
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    };
                }
                return undefined;
            },
        },
    );

    Object.defineProperty(global, "localStorage", {
        value: localStorage,
        writable: true,
        // The previous installs left this non-configurable — the mock then could
        // never be swapped again cleanly within the worker realm.
        configurable: true,
    });
    installedMock = localStorage;

    return localStorage;
};

/**
 * Rewind to the descriptor this install found — but ONLY while we still own the
 * binding. If another consumer installed over us, or the realm never handed us a
 * binding to rewind to, touching `localStorage` here is exactly the wipe that
 * poisoned later files in the worker; so we leave the current binding alone.
 */
export const restoreLocalStorage = () => {
    if (!weOwnTheBinding()) {
        return;
    }
    if (savedDescriptor) {
        Object.defineProperty(global, "localStorage", savedDescriptor);
    } else {
        // We installed into a realm that had no localStorage binding at all —
        // removing our mock returns it to that same absent state.
        delete (global as { localStorage?: unknown }).localStorage;
    }
    installedMock = undefined;
};
