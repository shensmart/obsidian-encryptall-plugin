import { App, Modal } from 'obsidian';
import { getLanguage } from '../i18n';
import type EncryptAllPlugin from '../main';

export class PasswordModal extends Modal {
    private password: string | null = null;
    private onSubmit: (password: string | null) => void;
    private inputEl: HTMLInputElement;
    private message: string;
    private plugin: EncryptAllPlugin;

    constructor(app: App, plugin: EncryptAllPlugin, message: string, onSubmit: (password: string | null) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.message = message;
        this.plugin = plugin;
        // console.log('[EncryptAll] PasswordModal constructed with message:', message);
    }

    onOpen() {
        // console.log('[EncryptAll] PasswordModal opening...');
        const { contentEl } = this;
        contentEl.empty();

        const t = getLanguage(this.plugin.settings.language).encrypt;

        // 创建标题
        const titleEl = contentEl.createEl('h2', { text: t.modal.title, cls: 'modal-title' });

        // 创建表单容器
        const formContainer = contentEl.createEl('div', { cls: 'password-modal-container' });

        // 创建输入框容器
        const inputContainer = formContainer.createEl('div', { cls: 'input-container' });

        // 创建输入框
        this.inputEl = inputContainer.createEl('input', {
            type: 'password',
            placeholder: this.message,
            value: '',
        });

        // 创建按钮容器
        const buttonContainer = formContainer.createEl('div', { cls: 'button-container' });

        // 创建按钮
        const submitButton = buttonContainer.createEl('button', {
            text: t.modal.submit,
            cls: 'mod-cta',
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: t.modal.cancel,
        });

        // 添加事件监听器
        this.inputEl.addEventListener('keydown', (e) => {
            // console.log('[EncryptAll] Key pressed:', e.key);
            if (e.key === 'Enter') {
                // console.log('[EncryptAll] Enter key pressed, submitting...');
                e.preventDefault();
                this.password = this.inputEl.value || null;
                // console.log('[EncryptAll] Password set from Enter key:', this.password ? '***' : 'null');
                this.close();
            }
        });

        submitButton.addEventListener('click', (e) => {
            // console.log('[EncryptAll] Submit button clicked');
            e.preventDefault();
            this.password = this.inputEl.value || null;
            // console.log('[EncryptAll] Password set from Submit button:', this.password ? '***' : 'null');
            this.close();
        });

        cancelButton.addEventListener('click', (e) => {
            // console.log('[EncryptAll] Cancel button clicked');
            e.preventDefault();
            this.password = null;
            this.close();
        });

        // 使用 setTimeout 确保在 Modal 完全打开后再设置焦点
        setTimeout(() => {
            this.inputEl.focus();
            this.inputEl.select();
        }, 100);

        // console.log('[EncryptAll] PasswordModal opened');
    }

    onClose() {
        // console.log('[EncryptAll] PasswordModal closing...');
        const { contentEl } = this;
        contentEl.empty();
        if (this.onSubmit) {
            // console.log('[EncryptAll] Calling onSubmit callback with password:', this.password ? '***' : 'null');
            this.onSubmit(this.password);
        } else {
            // console.log('[EncryptAll] No onSubmit callback provided');
        }
        // console.log('[EncryptAll] PasswordModal closed');
    }
} 