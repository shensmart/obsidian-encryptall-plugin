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
        const titleEl = contentEl.createEl('h2', { text: this.title });
        titleEl.style.textAlign = 'center';

        // 创建进度条容器
        const progressContainer = contentEl.createEl('div', { cls: 'progress-container' });
        progressContainer.style.width = '100%';
        progressContainer.style.height = '20px';
        progressContainer.style.backgroundColor = '#eee';
        progressContainer.style.borderRadius = '10px';
        progressContainer.style.overflow = 'hidden';
        progressContainer.style.margin = '20px 0';

        // 创建进度条
        this.progressBarEl = progressContainer.createEl('div', { cls: 'progress-bar' });
        this.progressBarEl.style.width = `${this.progress}%`;
        this.progressBarEl.style.height = '100%';
        this.progressBarEl.style.backgroundColor = '#4CAF50';
        this.progressBarEl.style.transition = 'width 0.3s ease-in-out';

        // 创建文本显示
        this.textEl = contentEl.createEl('div', { text: this.text });
        this.textEl.style.textAlign = 'center';
        this.textEl.style.marginTop = '10px';
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