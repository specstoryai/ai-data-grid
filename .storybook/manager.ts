import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

const aiDataGridTheme = create({
    base: "dark",
    brandTitle: "AI Data Grid",
    brandUrl: "https://github.com/specstoryai/ai-data-grid",
});

addons.setConfig({
    isFullscreen: false,
    showNav: true,
    showPanel: false,
    panelPosition: "right",
    enableShortcuts: true,
    isToolshown: false,
    theme: aiDataGridTheme,
    selectedPanel: undefined,
    initialActive: "sidebar",
    sidebar: {
        showRoots: true,
        collapsedRoots: ["Subcomponents", "TestCases"],
    },
    toolbar: {
        title: { hidden: false },
        zoom: { hidden: false },
        eject: { hidden: false },
        copy: { hidden: false },
        fullscreen: { hidden: false },
    },
});
