// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    CAMERA_FLY_DURATION,
    type CommandKeys,
    Config,
    DOCUMENT_FILE_EXTENSION,
    I18n,
    type IApplication,
    type ICommand,
    type IDataExchange,
    type IDocument,
    type IPluginManager,
    type IService,
    type IShapeProvider,
    type IStorage,
    type IView,
    type IVisualFactory,
    type IWindow,
    Logger,
    Material,
    NodeUtils,
    Observable,
    ObservableCollection,
    PerformanceProfiler,
    PLUGIN_FILE_EXTENSION,
    Plane,
    PubSub,
    type Serialized,
    ShapeNode,
    ShapeTypes,
    setCurrentApplication,
    VisualConfig,
    type VisualItemConfig,
} from "@chili3d/core";
import { Document } from "./document";
import { PluginManager } from "./pluginManager";
import { importFiles } from "./utils";

export interface ApplicationOptions {
    visualFactory: IVisualFactory;
    shapeProvider: IShapeProvider;
    services: IService[];
    storage: IStorage;
    dataExchange: IDataExchange;
    mainWindow?: IWindow;
}

export class Application extends Observable implements IApplication {
    readonly dataExchange: IDataExchange;
    readonly visualFactory: IVisualFactory;
    readonly shapeProvider: IShapeProvider;
    readonly services: IService[];
    readonly storage: IStorage;
    readonly mainWindow?: IWindow;
    readonly pluginManager: IPluginManager;
    readonly views = new ObservableCollection<IView>();
    readonly documents: Set<IDocument> = new Set<IDocument>();

    lastCommand: CommandKeys | undefined;

    get executingCommand(): ICommand | undefined {
        return this.getPrivateValue("executingCommand", undefined);
    }
    set executingCommand(value: ICommand | undefined) {
        this.setProperty("executingCommand", value);
    }

    get activeView(): IView | undefined {
        return this.getPrivateValue("activeView", undefined);
    }
    set activeView(value: IView | undefined) {
        if (value?.document) {
            if (this.has3DContent(value.document)) {
                Config.instance.is2DDraftingMode = false;
                Config.instance.dynamicWorkplane = true;
            } else {
                const is2D = (value.document as any).userData?.viewState?.is2DDraftingMode;
                if (typeof is2D === "boolean") {
                    Config.instance.is2DDraftingMode = is2D;
                }
            }
        }
        this.setProperty("activeView", value, () => {
            PubSub.default.pub("activeViewChanged", value);
        });
    }

    constructor(option: ApplicationOptions) {
        super();

        setCurrentApplication(this);
        this.visualFactory = option.visualFactory;
        this.shapeProvider = option.shapeProvider;
        this.services = option.services;
        this.storage = option.storage;
        this.dataExchange = option.dataExchange;
        this.mainWindow = option.mainWindow;
        this.pluginManager = new PluginManager(this);
        this.services.forEach((x) => x.register(this));
        this.services.forEach((x) => x.start());
        this.initEvents();
    }

    private initEvents() {
        window.onbeforeunload = this.handleWindowUnload;
        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("visibilitychange", this.handleVisibilityChange);
        }
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("pagehide", this.handlePageHide);
        }
        this.mainWindow?.addEventListener("dragstart", this.handleDragStart);
        this.mainWindow?.addEventListener("dragover", this.handleDragOver);
        this.mainWindow?.addEventListener("drop", this.handleDrop);
        VisualConfig.onPropertyChanged(this.onVisualConfigChanged);
    }

    public async saveAllDirtyDocuments(): Promise<void> {
        for (const doc of this.documents) {
            const document = doc as any;
            if (typeof document?.save === "function") {
                const isDirty =
                    typeof document.isDirty === "function"
                        ? document.isDirty()
                        : (document.history?.undoCount?.() ?? 0) !== (document._lastSavedUndoCount ?? 0);
                if (!document.isDisposed && !document.history?.disabled && isDirty) {
                    try {
                        await document.save();
                        Logger.info(`Auto-saved document on visibility change / pagehide: ${document.name}`);
                    } catch (e) {
                        Logger.warn(`Failed to auto-save document on visibility change: ${document.name}`, e);
                    }
                }
            }
        }
    }

    private readonly handleVisibilityChange = async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            await this.saveAllDirtyDocuments();
        }
    };

    private readonly handlePageHide = async () => {
        await this.saveAllDirtyDocuments();
    };

    private readonly onVisualConfigChanged = (property: keyof VisualItemConfig) => {
        if (property === "defaultEdgeColor") {
            this.views.forEach((x) => x.update());
        }
    };

    private readonly handleWindowUnload = (event: BeforeUnloadEvent) => {
        if (this.activeView) {
            // Cancel the event as stated by the standard.
            event.preventDefault();
            // Chrome requires returnValue to be set.
            event.returnValue = "";
        }
    };

    private readonly handleDragStart = (ev: DragEvent) => {
        // Internal drags (feature-list reorder, project tree) start from elements
        // marked draggable — let them proceed; only block the browser's native
        // drags (selected text, images, links).
        if ((ev.target as HTMLElement | null)?.closest?.("[draggable='true']")) return;
        ev.preventDefault();
    };

    private readonly handleDragOver = (ev: DragEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect = "copy";
        }
    };

    private readonly handleDrop = (ev: DragEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        const files = this.extractDroppedFiles(ev.dataTransfer);
        this.importFiles(files);
    };

    async importFiles(files: File[] | FileList | undefined) {
        if (!files || files.length === 0) {
            return;
        }
        const { opens, imports, plugins } = this.groupFiles(files);
        this.loadPluginsWithLoading(plugins);
        this.loadDocumentsWithLoading(opens);
        importFiles(this, imports);
    }

    private loadPluginsWithLoading(plugins: File[]) {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                for (const pluginFile of plugins) {
                    await this.pluginManager.loadFromFile(pluginFile);
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.doc.open"),
        );
    }

    private loadDocumentsWithLoading(opens: File[]) {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                for (const file of opens) {
                    const json: Serialized = JSON.parse(await file.text());
                    await this.loadDocument(json);
                    this.activeView?.cameraController.fitContent({ duration: CAMERA_FLY_DURATION });
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.doc.open"),
        );
    }

    private groupFiles(files: FileList | File[]) {
        const opens: File[] = [];
        const imports: File[] = [];
        const plugins: File[] = [];
        for (const element of files) {
            const fileName = element.name.toLowerCase();
            if (fileName.endsWith(DOCUMENT_FILE_EXTENSION)) {
                opens.push(element);
            } else if (fileName.endsWith(PLUGIN_FILE_EXTENSION)) {
                plugins.push(element);
            } else {
                imports.push(element);
            }
        }
        return { opens, imports, plugins };
    }

    private extractDroppedFiles(dataTransfer: DataTransfer | null): File[] {
        if (!dataTransfer) return [];
        const fromFileList = Array.from(dataTransfer.files ?? []);
        if (fromFileList.length > 0) return fromFileList;
        const fromItems = Array.from(dataTransfer.items ?? [])
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
        return fromItems;
    }

    async openDocument(id: string): Promise<IDocument | undefined> {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const existingDoc = Array.from(this.documents).find((d) => d.id === id);
        const existingView = this.views.find((v) => v.document.id === id || v.document === existingDoc);
        if (existingView) {
            this.activeView = existingView;
            existingView.cameraController?.fitContent?.({ scope: "all", duration: 0 });
            return existingView.document;
        }
        const document = await Document.open(this, id);
        await this.createActiveView(document);
        const dur = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
        PerformanceProfiler.instance.recordTask("open_document", dur, document ? "success" : "error");
        return document;
    }

    async newDocument(name: string): Promise<IDocument> {
        const document = new Document(this, name);
        const lightGray = new Material({ document, name: "LightGray", color: 0xdedede });
        const deepGray = new Material({ document, name: "DeepGray", color: 0x898989 });
        document.modelManager.materials.push(lightGray, deepGray);
        await this.createActiveView(document);
        return document;
    }

    async loadDocument(data: Serialized): Promise<IDocument | undefined> {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const document = await Document.load(this, data);
        await this.createActiveView(document);
        const dur = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
        PerformanceProfiler.instance.recordTask("open_document", dur, document ? "success" : "error");
        return document;
    }

    async loadFileFromUrl(url: string): Promise<void> {
        return Promise.try(async () => {
            const filename = url.substring(url.lastIndexOf("/") + 1);
            if (!filename || !filename.includes(".")) {
                throw new Error(`No file name in url: ${url}`);
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch model: ${url}, statusText: ${response.statusText}`);
            }

            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type });
            await this.importFiles([file]);
        }).catch((err) => {
            Logger.error(err);
        });
    }

    private has3DContent(document: IDocument): boolean {
        if (!document.modelManager.rootNode) return false;
        const allNodes = NodeUtils.children(document.modelManager.rootNode);
        for (const node of allNodes) {
            if (node.constructor?.name === "ExtrudeNode" || (node as any).display?.() === "body.extrude")
                return true;
            if (node instanceof ShapeNode && node.shape?.isOk) {
                const st = node.shape.value.shapeType;
                if (st === ShapeTypes.solid || st === ShapeTypes.compoundSolid || st === ShapeTypes.shell) {
                    return true;
                }
            }
        }
        return false;
    }

    protected async createActiveView(document: IDocument | undefined) {
        if (document === undefined) return undefined;
        const view = document.visual.createView("3d", Plane.XY);
        this.activeView = view;

        const has3D = this.has3DContent(document);
        const viewState = (document as any).userData?.viewState;

        if (has3D) {
            Config.instance.is2DDraftingMode = false;
            Config.instance.dynamicWorkplane = true;
        } else if (viewState && typeof viewState.is2DDraftingMode === "boolean") {
            Config.instance.is2DDraftingMode = viewState.is2DDraftingMode;
        }

        const isOutlier = (p?: { x: number; y: number; z?: number }) => {
            if (!p) return false;
            return Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000 || Math.abs(p.z ?? 0) > 100000;
        };
        const hasValidViewState =
            viewState?.position &&
            viewState?.target &&
            !isOutlier(viewState.position) &&
            !isOutlier(viewState.target);

        if (Config.instance.is2DDraftingMode) {
            view.cameraController.setTopView2D?.(false);
        } else if (hasValidViewState) {
            view.cameraController.lookAt(
                viewState.position,
                viewState.target,
                viewState.up ?? { x: 0, y: 0, z: 1 },
                { duration: 0 },
            );
        }

        const doFit = () => {
            if (view.width > 1 && view.height > 1) {
                view.resize(view.width, view.height);
            }
            view.cameraController.fitContent({ scope: "all", duration: 0 });
        };

        doFit();
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                doFit();
            });
        }
    }
}
