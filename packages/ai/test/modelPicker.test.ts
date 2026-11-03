// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { DiscoveredModel } from "../src/llm/discovery";
import { KNOWN_VENDORS } from "../src/llm/providerRegistry";
import { ModelPicker } from "../src/modelPicker";
import style from "../src/modelPicker.module.css";

describe("ModelPicker", () => {
    const mockModels: DiscoveredModel[] = [
        {
            id: "gpt-4o",
            name: "GPT-4o (Omni)",
            toolCapability: "supported",
            hasVision: true,
            contextLength: 128000,
            isDefault: true,
        },
        {
            id: "gpt-4o-mini",
            name: "GPT-4o Mini",
            toolCapability: "supported",
            hasVision: true,
            contextLength: 128000,
        },
        {
            id: "o1-preview",
            name: "O1 Preview (Reasoning)",
            toolCapability: "unsupported",
            hasVision: false,
            contextLength: 128000,
        },
        {
            id: "custom-community-model",
            name: "Community Model",
            toolCapability: "unverified",
            hasVision: false,
        },
    ];

    test("initializes with default state and initial model", () => {
        const picker = new ModelPicker({ initialModel: "my-existing-model" });
        expect(picker.getValue()).toBe("my-existing-model");

        const triggerText = picker.element.querySelector("button span");
        expect(triggerText?.textContent).toBe("my-existing-model");
    });

    test("setModels populates models and updates counts", () => {
        const picker = new ModelPicker();
        picker.setModels(mockModels, KNOWN_VENDORS.openai);

        expect(picker.getModels().length).toBe(4);

        // Recommended tab excludes unsupported toolCapability
        // gpt-4o, gpt-4o-mini, custom-community-model (unverified) are included in recommended (3 models)
        // o1-preview (unsupported) is excluded from recommended
        const tabBtns = picker.element.querySelectorAll(`.${style.tab}`);
        expect(tabBtns.length).toBe(3);
        expect(tabBtns[0].textContent).toBe("ai.modelTabRecommended");
        expect(tabBtns[1].textContent).toBe("ai.modelTabAll");
    });

    test("searches models by ID and display name", () => {
        const picker = new ModelPicker();
        picker.setModels(mockModels, KNOWN_VENDORS.openai);
        picker.setTab("all");

        const searchInput = picker.element.querySelector(`.${style.searchInput}`) as HTMLInputElement;

        // Search by ID
        searchInput.value = "mini";
        searchInput.dispatchEvent(new Event("input"));

        const itemsAfterSearch1 = picker.element.querySelectorAll("div[role='option']");
        expect(itemsAfterSearch1.length).toBe(1);
        expect(itemsAfterSearch1[0].textContent).toContain("gpt-4o-mini");

        // Search by Display Name
        searchInput.value = "Reasoning";
        searchInput.dispatchEvent(new Event("input"));

        const itemsAfterSearch2 = picker.element.querySelectorAll("div[role='option']");
        expect(itemsAfterSearch2.length).toBe(1);
        expect(itemsAfterSearch2[0].textContent).toContain("o1-preview");

        // Search with no matches shows empty placeholder
        searchInput.value = "nonexistent-model-xyz";
        searchInput.dispatchEvent(new Event("input"));

        const itemsAfterSearchEmpty = picker.element.querySelectorAll("div[role='option']");
        expect(itemsAfterSearchEmpty.length).toBe(0);
        const listContainer = picker.element.querySelector(`.${style.list}`);
        expect(listContainer?.textContent).toContain("ai.noMatchingModels");
    });

    test("tab switching filters recommended vs all vs custom", () => {
        const picker = new ModelPicker();
        picker.setModels(mockModels, KNOWN_VENDORS.openai);

        // Default tab is recommended (gpt-4o, gpt-4o-mini have toolCapability="supported")
        let options = picker.element.querySelectorAll("div[role='option']");
        expect(options.length).toBe(2);

        // Switch to "all" tab
        picker.setTab("all");
        options = picker.element.querySelectorAll("div[role='option']");
        expect(options.length).toBe(4); // includes o1-preview

        // Switch to "custom" tab
        picker.setTab("custom");
        const customInput = picker.element.querySelector(`.${style.customInput}`) as HTMLInputElement;
        const customBtn = picker.element.querySelector(`.${style.customApplyBtn}`) as HTMLButtonElement;
        expect(customInput).not.toBeNull();
        expect(customBtn).not.toBeNull();

        customInput.value = "my-special-finetune:v1";
        customBtn.click();
        expect(picker.getValue()).toBe("my-special-finetune:v1");
    });

    test("preserves currently saved model when setModels is called", () => {
        const picker = new ModelPicker({ initialModel: "preserved-custom-model" });
        expect(picker.getValue()).toBe("preserved-custom-model");

        // Discovery arrives with different models
        picker.setModels(mockModels, KNOWN_VENDORS.openai);

        // Value must NOT be wiped or overwritten
        expect(picker.getValue()).toBe("preserved-custom-model");
    });

    test("keyboard navigation selects models and toggles dropdown", () => {
        let selected = "";
        const picker = new ModelPicker({
            onModelSelected: (id) => {
                selected = id;
            },
        });
        picker.setModels(mockModels, KNOWN_VENDORS.openai);

        const trigger = picker.element.querySelector(`.${style.trigger}`) as HTMLButtonElement;
        const searchInput = picker.element.querySelector(`.${style.searchInput}`) as HTMLInputElement;

        // Open via ArrowDown on trigger
        trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

        // Navigate with ArrowDown in search input
        searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        // First item (gpt-4o) selected
        expect(selected).toBe("gpt-4o");
        expect(picker.getValue()).toBe("gpt-4o");

        // Escape closes dropdown
        trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    test("click outside closes the dropdown", () => {
        const picker = new ModelPicker();
        document.body.appendChild(picker.element);
        try {
            picker.openDropdown();
            const dropdown = picker.element.querySelector(`.${style.dropdown}`) as HTMLElement;
            expect(dropdown.style.display).toBe("flex");

            // Click outside
            document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            expect(dropdown.style.display).toBe("none");
        } finally {
            picker.dispose();
            picker.element.remove();
        }
    });

    test("handles catalog with no tool-supported models without promoting arbitrary models", () => {
        const picker = new ModelPicker();
        const unverifiedModels: DiscoveredModel[] = [
            {
                id: "model-alpha",
                name: "Model Alpha",
                toolCapability: "unverified",
                isDefault: true,
            },
            {
                id: "model-beta",
                name: "Model Beta",
                toolCapability: "unsupported",
            },
        ];

        picker.setModels(unverifiedModels, KNOWN_VENDORS.openai);

        // Automatically switches to "all" tab so user can see and select models
        const allOptions = picker.element.querySelectorAll("div[role='option']");
        expect(allOptions.length).toBe(2);

        // Switching explicitly to recommended tab displays ai.noRecommendedModels and 0 options
        picker.setTab("recommended");
        const recOptions = picker.element.querySelectorAll("div[role='option']");
        expect(recOptions.length).toBe(0); // Arbitrary models are NOT placed into recommended
        const listContainer = picker.element.querySelector(`.${style.list}`);
        expect(listContainer?.textContent).toContain("ai.noRecommendedModels");
    });
});
