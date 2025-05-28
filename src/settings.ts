import { App, PluginSettingTab, Setting } from 'obsidian';
import type EncryptAllPlugin from './main';
import { Language } from './i18n';

export interface EncryptAllSettings {
    autoEncryptTimeout: number;
    language: Language;
}

export const DEFAULT_SETTINGS: EncryptAllSettings = {
    autoEncryptTimeout: 600,
    language: 'zh'
};

export class EncryptAllSettingTab extends PluginSettingTab {
    plugin: EncryptAllPlugin;

    constructor(app: App, plugin: EncryptAllPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Encrypt All Settings' });

        new Setting(containerEl)
            .setName('Language')
            .setDesc('Select your preferred language')
            .addDropdown(dropdown => dropdown
                .addOption('en', 'English')
                .addOption('zh', '中文')
                .setValue(this.plugin.settings.language)
                .onChange(async (value: Language) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto Encrypt Timeout')
            .setDesc('Timeout in seconds before auto-encrypting files')
            .addText(text => text
                .setValue(this.plugin.settings.autoEncryptTimeout.toString())
                .onChange(async (value) => {
                    const timeout = parseInt(value);
                    if (!isNaN(timeout)) {
                        this.plugin.settings.autoEncryptTimeout = timeout;
                        await this.plugin.saveSettings();
                    }
                }));
    }
} 