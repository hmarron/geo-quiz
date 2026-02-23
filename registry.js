// ─── Central Registry for Plugins and Modes ──────────────────────────────────

const Registry = (() => {
    const plugins = new Map();
    const modes = new Map();
    let activePluginId = null;

    return {
        // --- Plugins ---
        registerPlugin(pluginInstance) {
            if (!pluginInstance.id) throw new Error("Plugin must have an id");
            plugins.set(pluginInstance.id, pluginInstance);
            if (!activePluginId) activePluginId = pluginInstance.id;
            console.log(`Plugin registered: ${pluginInstance.name} (${pluginInstance.id})`);
            
            // Try to update UI if function exists
            if (typeof renderPluginPicker === 'function') {
                renderPluginPicker();
            }
        },

        getPlugin(id) {
            return plugins.get(id);
        },

        getAllPlugins() {
            return Array.from(plugins.values());
        },

        setActivePlugin(id) {
            if (plugins.has(id)) {
                activePluginId = id;
            }
        },

        getActivePlugin() {
            return plugins.get(activePluginId);
        },

        // --- Modes ---
        registerMode(modeId, modeObject) {
            modeObject.id = modeId;
            modes.set(modeId, modeObject);
            console.log(`Mode registered: ${modeObject.name} (${modeId})`);
        },

        getMode(id) {
            return modes.get(id);
        },

        getAllModes() {
            return Array.from(modes.values());
        },

        getModesForPlugin(pluginId) {
            const plugin = plugins.get(pluginId);
            if (!plugin || !plugin.supportedModes) return this.getAllModes();
            return this.getAllModes().filter(mode => plugin.supportedModes.includes(mode.id));
        }
    };
})();

// Register a sample CSV quiz after the Registry is defined
if (typeof CSVQuizPlugin !== 'undefined') {
    Registry.registerPlugin(new CSVQuizPlugin({
        id: 'capitals-quiz',
        name: 'European Capitals',
        title: 'Capital Cities',
        subtitle: 'Identify European capitals from the country name',
        csvUrl: 'generic-quiz.csv',
        mapping: {
            id: 'id',
            answer: 'answer',
            questionMedia: 'questionMedia', // This is the country name (text)
            categories: 'categories'
        }
    }));
}
