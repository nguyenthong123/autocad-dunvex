// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { mockLocalStorage, restoreLocalStorage } from "../test-utils";

// TASK-40 bug ticket (docs/tasks/TASK-40-bug-localstorage-suite-pollution.md):
// installing the mock used to lock `localStorage` non-configurable and the tests
// reset it to `undefined`, poisoning every later file in the same rstest worker.
// These tests pin the isolation contract: install → restore returns the realm's
// original binding and nothing is left undefined.
describe("mockLocalStorage realm isolation", () => {
    const descriptorOf = () => Object.getOwnPropertyDescriptor(global, "localStorage");

    test("the realm ships a usable localStorage before any mock installs", () => {
        // Precondition asserted, not assumed: happy-dom provides the binding the
        // isolation contract is measured against.
        const original = descriptorOf();
        expect(original).toBeDefined();
        expect(typeof (global as any).localStorage.getItem).toBe("function");
    });

    test("install then restore hands back the exact original descriptor", () => {
        const before = descriptorOf();
        expect(before).toBeDefined();
        // happy-dom exposes `localStorage` as a global ACCESSOR — read the binding,
        // not `descriptor.value`, when checking that the realm got its own back.
        const originalBinding = (global as any).localStorage;
        expect(originalBinding).toBeDefined();
        const mock = mockLocalStorage();
        mock.setItem("isolation-key", "1");
        expect((global as any).localStorage.getItem("isolation-key")).toBe("1");
        restoreLocalStorage();
        const after = descriptorOf();
        expect(after).toEqual(before);
        // The restored binding is the REAL storage again, not the mock and not undefined.
        expect((global as any).localStorage).toBe(originalBinding);
        expect((global as any).localStorage.getItem("isolation-key")).toBeNull();
    });

    test("the installed mock stays replaceable inside the worker (configurable: true)", () => {
        const before = descriptorOf();
        mockLocalStorage();
        const second = mockLocalStorage();
        second.setItem("twice", "2");
        expect((global as any).localStorage.getItem("twice")).toBe("2");
        restoreLocalStorage();
        expect(descriptorOf()).toEqual(before);
    });

    test("a later consumer still reads a defined localStorage after a full mock cycle", () => {
        // Regression for the exact victim shape: code that touches localStorage
        // directly (ObjectStorage in rulesStore) must not see `undefined`.
        mockLocalStorage();
        restoreLocalStorage();
        expect(typeof (global as any).localStorage?.getItem).toBe("function");
    });

    test("restore without a prior install is a no-op, not a wipe", () => {
        const before = descriptorOf();
        restoreLocalStorage();
        expect(descriptorOf()).toEqual(before);
    });
});
