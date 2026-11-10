// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Constants, type IApplication, PropertyHistoryRecord, Transaction } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { Document } from "../src/document";

describe("Document Autosave & Revision Tracking", () => {
    let mockApp: IApplication;
    let document: Document;
    let savedDocs: any[] = [];

    beforeEach(() => {
        mockApp = createMockApplication();
        savedDocs = [];
        mockApp.storage.put = async (_db, table, _id, data) => {
            if (table === Constants.DocumentTable) {
                savedDocs.push(data);
            }
            return true;
        };
        document = new Document(mockApp, "test-doc");
    });

    afterEach(() => {
        document.dispose();
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
        let finishPut: () => void;
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
        finishPut!();
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
});
