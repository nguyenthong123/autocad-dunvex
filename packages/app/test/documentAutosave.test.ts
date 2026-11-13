// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Constants, type IApplication, PropertyHistoryRecord, PubSub, Transaction } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { Document } from "../src/document";

describe("Document Autosave & Revision Tracking", () => {
    let mockApp: IApplication;
    let document: Document;
    let savedDocs: Array<Record<string, unknown>> = [];
    let storageDataMap: Map<string, unknown> = new Map();

    beforeEach(() => {
        mockApp = createMockApplication();
        savedDocs = [];
        storageDataMap = new Map();
        mockApp.storage.put = async (_db, table, id, data) => {
            if (table === Constants.DocumentTable) {
                savedDocs.push(data);
                storageDataMap.set(id, data);
            }
            return true;
        };
        mockApp.storage.get = async (_db, table, id) => {
            if (table === Constants.DocumentTable) {
                return storageDataMap.get(id);
            }
            return undefined;
        };
        document = new Document(mockApp, "test-doc");
    });

    afterEach(() => {
        if (!document.isDisposed) {
            document.dispose();
        }
    });

    test("recognizes unsaved changes past 50 undo steps threshold", async () => {
        // 1. Fill undo stack to default limit 50
        const dummy = { val: 0 };
        for (let i = 1; i <= 50; i++) {
            dummy.val = i;
            Transaction.add(document, new PropertyHistoryRecord(dummy, "val", i - 1, i));
        }

        expect(document.history.undoCount()).toBe(50);
        expect(document.isDirty()).toBe(true);

        // 2. Save document at step 50
        await document.save();
        expect(savedDocs.length).toBe(1);
        expect(document.isDirty()).toBe(false);

        // 3. Edit 51: undoCount() stays at 50 because of undoLimits
        dummy.val = 51;
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", 50, 51));
        expect(document.history.undoCount()).toBe(50);

        // Document MUST be recognized as dirty!
        expect(document.isDirty()).toBe(true);

        // 4. Save edit 51
        await document.save();
        expect(savedDocs.length).toBe(2);
        expect(document.isDirty()).toBe(false);
    });

    test("correctly tracks dirty state across undo and redo", async () => {
        const dummy = { val: 0 };
        for (let i = 1; i <= 10; i++) {
            dummy.val = i;
            Transaction.add(document, new PropertyHistoryRecord(dummy, "val", i - 1, i));
        }

        // Save at step 10
        await document.save();
        expect(document.isDirty()).toBe(false);

        // Step 11
        dummy.val = 11;
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", 10, 11));
        expect(document.isDirty()).toBe(true);

        // Undo back to step 10: document returns to saved state!
        document.history.undo();
        expect(document.isDirty()).toBe(false);

        // Redo back to step 11: document becomes dirty again!
        document.history.redo();
        expect(document.isDirty()).toBe(true);

        // Undo twice back to step 9 (before saved state): dirty!
        document.history.undo();
        document.history.undo();
        expect(document.isDirty()).toBe(true);
    });

    test("preserves dirty state when edits occur during asynchronous save", async () => {
        const dummy = { val: 0 };
        dummy.val = 1;
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", 0, 1));
        expect(document.isDirty()).toBe(true);

        // Simulate slow storage.put
        let finishPut: (() => void) | undefined;
        const putPromise = new Promise<void>((resolve) => {
            finishPut = resolve;
        });

        let inFlight = false;
        mockApp.storage.put = async (_db, table, _id, data) => {
            if (table === Constants.DocumentTable) {
                savedDocs.push(data);
                inFlight = true;
                await putPromise;
            }
            return true;
        };

        const savePromise = document.save();

        // Wait until storage.put is actually actively in flight
        while (!inFlight) {
            await new Promise((r) => setTimeout(r, 0));
        }

        // While save is in flight, user makes another edit
        dummy.val = 2;
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", 1, 2));

        // Let the first save finish
        (finishPut as any)?.();
        await savePromise;

        // Even though the first save finished, the document has the in-flight edit (val = 2)
        // so it must remain dirty!
        expect(document.isDirty()).toBe(true);

        // The next save saves edit 2 and marks clean
        await document.save();
        expect(document.isDirty()).toBe(false);
        expect(savedDocs.length).toBe(2);
    });

    test("keeps dirty state when storage.put fails with error", async () => {
        const dummy = { val: 0 };
        dummy.val = 1;
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", 0, 1));
        expect(document.isDirty()).toBe(true);

        mockApp.storage.put = async (_db, table) => {
            if (table === Constants.DocumentTable) {
                throw new Error("IndexedDB quota exceeded");
            }
            return true;
        };

        await expect(document.save()).rejects.toThrow("IndexedDB quota exceeded");

        // Save failed: document must remain dirty!
        expect(document.isDirty()).toBe(true);
    });

    test("close waits for in-flight save A, writes latest state B, and preserves B on reopen", async () => {
        // Initial state A
        document.userData = { state: "A" };
        const dummy = { val: "A" };
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "", "A"));

        // Trigger autosave/save A, held in-flight
        let resolvePutA: (() => void) | undefined;
        const putAPromise = new Promise<void>((resolve) => {
            resolvePutA = resolve;
        });

        let passACalled = false;
        let passBCalled = false;

        mockApp.storage.put = async (_db, table, id, data) => {
            if (table === Constants.DocumentTable) {
                savedDocs.push(data);
                storageDataMap.set(id, data);
                if (!passACalled) {
                    passACalled = true;
                    await putAPromise;
                } else {
                    passBCalled = true;
                }
            }
            return true;
        };

        const autoSavePromise = document.save();

        // Wait until save A is actively in-flight
        while (!passACalled) {
            await new Promise((r) => setTimeout(r, 0));
        }

        // User edits document to state B while save A is in-flight
        document.userData = { state: "B" };
        dummy.val = "B";
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "A", "B"));
        expect(document.isDirty()).toBe(true);

        // User triggers close with confirmation to save
        const closePromise = document.close();

        // DOCUMENT MUST REMAIN OPEN while save B is pending!
        expect(document.isDisposed).toBe(false);
        expect(mockApp.documents.has(document)).toBe(true);
        expect(passBCalled).toBe(false);

        // Now let save A finish
        (resolvePutA as any)?.();
        await autoSavePromise;

        // Wait for close to finish (which must execute save B)
        await closePromise;

        // Verify save B was actually called and document is now cleanly closed
        expect(passBCalled).toBe(true);
        expect(document.isDisposed).toBe(true);
        expect(mockApp.documents.has(document)).toBe(false);
        expect(savedDocs.length).toBe(2);

        // Reopen document and verify state B is preserved!
        const reopenedDoc = await Document.open(mockApp, document.id);
        expect(reopenedDoc).toBeDefined();
        expect((reopenedDoc?.userData as any)?.state).toBe("B");
        expect((savedDocs[1] as any).isClosing).toBe(true);
        reopenedDoc?.dispose();
    });

    test("keeps document open and reports error when final save B on close fails", async () => {
        // Initial state A
        document.userData = { state: "A" };
        const dummy = { val: "A" };
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "", "A"));

        let resolvePutA: (() => void) | undefined;
        const putAPromise = new Promise<void>((resolve) => {
            resolvePutA = resolve;
        });

        let passACalled = false;
        let passBCalled = false;
        let errorReported: string | undefined;

        PubSub.default.sub("displayError", (msg: string) => {
            errorReported = msg;
        });

        mockApp.storage.put = async (_db, table, id, data) => {
            if (table === Constants.DocumentTable) {
                if (!passACalled) {
                    passACalled = true;
                    savedDocs.push(data);
                    storageDataMap.set(id, data);
                    await putAPromise;
                } else {
                    passBCalled = true;
                    // Lượt ghi B thất bại!
                    throw new Error("QuotaExceededError on disk write");
                }
            }
            return true;
        };

        const autoSavePromise = document.save();

        while (!passACalled) {
            await new Promise((r) => setTimeout(r, 0));
        }

        // Edit to state B
        document.userData = { state: "B" };
        dummy.val = "B";
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "A", "B"));

        // Trigger close
        const closePromise = document.close();

        // Let save A finish
        resolvePutA?.();
        await autoSavePromise;

        // Wait for close flow to handle error
        await closePromise;

        // VERIFY: Save B was attempted, but failed
        expect(passBCalled).toBe(true);

        // CRITICAL ASSERTION: The document MUST STAY OPEN!
        expect(document.isDisposed).toBe(false);
        expect(mockApp.documents.has(document)).toBe(true);

        // Error toast was published
        expect(errorReported).toBeDefined();
        expect(errorReported).toContain("QuotaExceededError");
    });

    test("close waits and writes subsequent edits made after snapshot was taken but before storage.put completed", async () => {
        // Initial state A
        document.userData = { state: "A" };
        const dummy = { val: "A" };
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "", "A"));

        let resolvePut1: (() => void) | undefined;
        let resolvePut2: (() => void) | undefined;
        let pass1Started = false;
        let pass2Started = false;

        const put1Promise = new Promise<void>((resolve) => {
            resolvePut1 = resolve;
        });
        const put2Promise = new Promise<void>((resolve) => {
            resolvePut2 = resolve;
        });

        let callCount = 0;
        mockApp.storage.put = async (_db, table, id, data) => {
            if (table === Constants.DocumentTable) {
                callCount++;
                savedDocs.push(data);
                storageDataMap.set(id, data);
                if (callCount === 1) {
                    pass1Started = true;
                    await put1Promise;
                } else if (callCount === 2) {
                    pass2Started = true;
                    await put2Promise;
                }
            }
            return true;
        };

        // User triggers close
        const closePromise = document.close();

        // Wait until pass 1 is in-flight (snapshot A taken)
        while (!pass1Started) {
            await new Promise((r) => setTimeout(r, 0));
        }
        expect(document.isClosingInProgress).toBe(true);

        // Edit to state B while pass 1's storage.put is still in-flight
        document.userData = { state: "B" };
        dummy.val = "B";
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "A", "B"));

        // Finish pass 1
        resolvePut1?.();

        // Wait until pass 2 is in-flight (snapshot B taken)
        while (!pass2Started) {
            await new Promise((r) => setTimeout(r, 0));
        }

        // DOCUMENT MUST STILL REMAIN OPEN!
        expect(document.isDisposed).toBe(false);
        expect(mockApp.documents.has(document)).toBe(true);

        // Edit to state C while pass 2's storage.put is in-flight
        document.userData = { state: "C" };
        dummy.val = "C";
        Transaction.add(document, new PropertyHistoryRecord(dummy, "val", "B", "C"));

        // Finish pass 2
        resolvePut2?.();

        // Await the close operation to complete all required passes
        await closePromise;

        // VERIFY: All 3 passes were executed, document is now cleanly closed
        expect(callCount).toBe(3);
        expect(document.isDisposed).toBe(true);
        expect(mockApp.documents.has(document)).toBe(false);

        // Reopen document and verify state C is strictly preserved!
        const reopenedDoc = await Document.open(mockApp, document.id);
        expect(reopenedDoc).toBeDefined();
        expect((reopenedDoc?.userData as any)?.state).toBe("C");
        expect((savedDocs[savedDocs.length - 1] as any).isClosing).toBe(true);
        reopenedDoc?.dispose();
    });
});
