import { App, Modal } from 'obsidian';

interface ProgressBarOptions {
    title: string;
    text: string;
    progress: number;
}

export class ProgressBar extends Modal {
    private progress: number;
    private text: string;
    private title: string;
    private progressBarEl: HTMLElement;
    private textEl: HTMLElement;

    constructor(app: App, options: ProgressBarOptions) {
        super(app);
        this.progress = options.progress;
        this.text = options.text;
        this.title = options.title;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 创建标题
        const titleEl = contentEl.createEl('h2', { text: this.title, cls: 'modal-title' });

        // 创建进度条容器
        const progressContainer = contentEl.createEl('div', { cls: 'progress-container' });

        // 创建进度条
        this.progressBarEl = progressContainer.createEl('div', { cls: 'progress-bar' });
        this.progressBarEl.style.width = `${this.progress}%`;

        // 创建文本显示
        this.textEl = contentEl.createEl('div', { text: this.text, cls: 'modal-text' });
    }

    updateProgress(progress: number, text?: string) {
        this.progress = progress;
        this.progressBarEl.style.width = `${progress}%`;
        if (text) {
            this.text = text;
            this.textEl.setText(text);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 