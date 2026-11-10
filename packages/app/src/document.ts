// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type Act,
    Config,
    Constants,
    errorText,
    History,
    I18n,
    type IApplication,
    type IDocument,
    Id,
    type IHistoryRecord,
    InternalClassName,
    type IPicker,
    type ISelection,
    type IVariableTable,
    type IVisual,
    Logger,
    ModelManager,
    Observable,
    ObservableCollection,
    PubSub,
    type Serialized,
    Serializer,
    VariableTable,
} from "@chili3d/core";
import { Picker } from "./picker";
import { SelectionManager } from "./selectionManager";

let persistenceRequested = false;
async function requestStoragePersistence(): Promise<void> {
    if (persistenceRequested) return;
    persistenceRequested = true;
    try {
        if (typeof navigator !== "undefined" && navigator.storage?.persist) {
            const isPersisted = await navigator.storage.persist();
            Logger.info(`Storage persistence granted: ${isPersisted}`);
        }
    } catch (e) {
        Logger.info(`Storage persistence request ignored: ${e}`);
    }
}

export class Document extends Observable implements IDocument {
    readonly visual: IVisual;
    readonly history: History;
    readonly selection: ISelection;
    readonly picker: IPicker;
    readonly acts = new ObservableCollection<Act>();
    readonly modelManager: ModelManager;
    /** Document-wide parameters shared by every body and sketch. */
    readonly variables: IVariableTable;
    userData: Record<string, unknown> = {};

    static readonly version = __DOCUMENT_VERSION__;

    get name(): string {
        return this.getPrivateValue("name");
    }
    set name(name: string) {
        if (this.name === name) return;
        this.setProperty("name", name);
        if (this.modelManager.rootNode) this.modelManager.rootNode.name = name;
    }

    private _lastSavedUndoTop: IHistoryRecord | undefined = undefined;
    private _lastSavedEvictedCount = 0;
    private _isSaving = false;
    private _isClosingInProgress = false;
    private readonly _queuedWaiters: Array<{
        resolve: () => void;
        reject: (err: unknown) => void;
        isClosing: boolean;
    }> = [];
    private _autoSaveTimer?: ReturnType<typeof setTimeout>;

    get isClosingInProgress(): boolean {
        return this._isClosingInProgress;
    }

    isDirty(): boolean {
        if (this.history.disabled) return false;
        if (this.history.undoTop() !== this._lastSavedUndoTop) return true;
        if (this._lastSavedUndoTop === undefined && this.history.evictedCount > this._lastSavedEvictedCount) {
            return true;
        }
        return false;
    }

    constructor(
        readonly application: IApplication,
        name: string,
        readonly id: string = Id.generate(),
    ) {
        super();
        this.setPrivateValue("name", name);
        this.modelManager = new ModelManager(this);
        this.history = new History();
        this.variables = new VariableTable(this);
        this.selection = new SelectionManager(this);
        this.picker = new Picker(this);
        this.visual = application.visualFactory.create(this);

        application.documents.add(this);

        if (typeof setInterval !== "undefined") {
            this._autoSaveTimer = setInterval(async () => {
                if (!this.isDisposed && this.isDirty()) {
                    try {
                        await this.save();
                        Logger.info(`Auto-saved document: ${this.name}`);
                    } catch (e) {
                        Logger.warn("Auto-save failed", e);
                    }
                }
            }, 60000);
        }
    }

    serialize(): Serialized {
        const view = this.application?.views.find((v) => v.document === this) ?? this.application?.activeView;
        if (view) {
            const cam = view.cameraController as any;
            if (cam) {
                const pos = cam.cameraPosition ?? cam.position;
                const tgt = cam.cameraTarget ?? cam.target;
                const up = cam.cameraUp ?? cam.up;
                const existingViewState = (this.userData as any)?.viewState;
                const is2D =
                    this.application?.activeView === view
                        ? Config.instance.is2DDraftingMode
                        : (existingViewState?.is2DDraftingMode ?? Config.instance.is2DDraftingMode);
                this.userData = {
                    ...this.userData,
                    viewState: {
                        cameraType: cam.cameraType,
                        position: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined,
                        target: tgt ? { x: tgt.x, y: tgt.y, z: tgt.z } : undefined,
                        up: up ? { x: up.x, y: up.y, z: up.z } : undefined,
                        mode: cam.mode,
                        is2DDraftingMode: is2D,
                    },
                };
            }
        }
        const serialized = {
            [InternalClassName]: "Document",
            version: __DOCUMENT_VERSION__,
            id: this.id,
            name: this.name,
            models: this.modelManager.serialize(),
            variables: this.variables.items,
            acts: this.acts.map((x) => Serializer.serializeObject(x)),
            userData: this.userData,
        };
        return serialized;
    }

    override disposeInternal(): void {
        super.disposeInternal();

        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = undefined;
        }

        this.modelManager.dispose();
        this.visual.dispose();
        this.history.dispose();
        this.variables.dispose();
        this.selection.dispose();
        this.acts.forEach((x) => x.dispose());
        this.acts.clear();
    }

    async save(isClosing = false): Promise<void> {
        if (this.isDisposed) return;

        return new Promise<void>((resolve, reject) => {
            this._queuedWaiters.push({ resolve, reject, isClosing });
            if (!this._isSaving) {
                this.processSaveQueue();
            }
        });
    }

    private async processSaveQueue(): Promise<void> {
        if (this._isSaving) return;
        this._isSaving = true;

        try {
            let isFirstPass = true;
            while (this._queuedWaiters.length > 0) {
                const currentBatch = this._queuedWaiters.splice(0, this._queuedWaiters.length);
                const isClosing = currentBatch.some((w) => w.isClosing);

                if (!isFirstPass && !this.isDirty() && !isClosing) {
                    for (const w of currentBatch) {
                        w.resolve();
                    }
                    continue;
                }
                isFirstPass = false;

                try {
                    await this.executeSavePass(isClosing);

                    if (isClosing && this.isDirty()) {
                        // User edited the document after the snapshot was taken but before the write finished.
                        // We must NOT resolve closing waiters yet; re-queue them to persist the latest changes.
                        this._queuedWaiters.unshift(...currentBatch);
                        continue;
                    }

                    for (const w of currentBatch) {
                        w.resolve();
                    }
                } catch (error) {
                    for (const w of currentBatch) {
                        w.reject(error);
                    }
                }
            }
        } finally {
            this._isSaving = false;
            if (this._queuedWaiters.length > 0) {
                this.processSaveQueue();
            }
        }
    }

    private async executeSavePass(isClosing: boolean): Promise<void> {
        await requestStoragePersistence();
        const snapshotUndoTop = this.history.undoTop();
        const snapshotEvictedCount = this.history.evictedCount;
        const snapshotRevision = this.history.revision;

        const data = this.serialize();
        if (isClosing) {
            (data as any).isClosing = true;
        }
        await this.application.storage.put(Constants.DBName, Constants.DocumentTable, this.id, data);
        this._lastSavedUndoTop = snapshotUndoTop;
        this._lastSavedEvictedCount = snapshotEvictedCount;
        this._lastSavedRevision = snapshotRevision;
        this._lastSavedUndoCount = this.history.undoCount();

        // The document is saved at this point. The thumbnail and the recents entry are a
        // courtesy — a view that cannot be captured, or a store that refuses the write,
        // must not turn a written document into a failed save (and a missing success toast).
        try {
            const ownView =
                this.application.views?.find((v) => v.document === this) ?? this.application.activeView;
            const isCurrentView =
                ownView && (!this.application.views || this.application.activeView === ownView);
            const image = isCurrentView
                ? ownView?.toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 })
                : undefined;
            const recentData: any = {
                id: this.id,
                name: this.name,
                date: Date.now(),
            };
            if (image) {
                recentData.image = image;
            }
            await this.application.storage.put(Constants.DBName, Constants.RecentTable, this.id, recentData);
        } catch (error) {
            Logger.warn(`document "${this.name}" saved, but its recent entry could not be written`, error);
        }
    }

    async close() {
        this._isClosingInProgress = true;
        const shouldSave =
            typeof window !== "undefined" && typeof window.confirm === "function"
                ? window.confirm(I18n.translate("prompt.saveDocument{0}", this.name))
                : true;
        if (shouldSave) {
            try {
                await this.save(true);
            } catch (error) {
                this._isClosingInProgress = false;
                Logger.error(`Failed to save document "${this.name}" on close`, error);
                PubSub.default.pub(
                    "displayError",
                    I18n.translate("toast.document.saveFailed{0}", errorText(error)),
                );
                return;
            }
        }

        const views = this.application.views.filter((x) => x.document === this);
        this.application.views.remove(...views);
        this.application.activeView = this.application.views.at(0);
        this.application.documents.delete(this);

        PubSub.default.pub("documentClosed", this);

        Logger.info(`document: ${this.name} closed`);
        this.dispose();
    }

    static async open(application: IApplication, id: string) {
        const data = (await application.storage.get(
            Constants.DBName,
            Constants.DocumentTable,
            id,
        )) as Serialized;
        if (data === undefined) {
            Logger.warn(`document: ${id} not find`);
            return;
        }
        const document = await Document.load(application, data);
        if (document !== undefined) {
            Logger.info(`document: ${document.name} opened`);
        }
        return document;
    }

    static async load(app: IApplication, data: Serialized): Promise<IDocument | undefined> {
        if ((data as any).version !== __DOCUMENT_VERSION__) {
            alert(
                "The file version has been upgraded, no compatibility treatment was done in the development phase",
            );
            return undefined;
        }
        let docName = typeof data["name"] === "string" ? data["name"] : "";
        if (!docName || /^undefined(\s+|$)/i.test(docName)) {
            docName = docName.replace(/^undefined\s*/i, "Dự án ") || "Dự án 1";
            if (docName === "Dự án ") docName = "Dự án 1";
        }
        const document = new Document(app, docName, data["id"]);
        document.history.disabled = true;
        // Before the models: a body's feature chain resolves its parameters against
        // the table, and deserializing a body rebuilds it.
        document.variables.setItems(data["variables"] ?? []);
        document.acts.push(...data["acts"].map((x: Serialized) => Serializer.deserializeObject(document, x)));
        if (data["userData"]) {
            document.userData = data["userData"];
        }

        await document.modelManager.deserialize(data["models"]);
        document.history.disabled = false;
        return document;
    }
}
