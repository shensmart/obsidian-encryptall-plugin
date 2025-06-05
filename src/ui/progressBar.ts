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
    private progressValueEl: HTMLElement;
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
        
        // 创建进度值元素
        this.progressValueEl = this.progressBarEl.createEl('div', { cls: 'progress-value' });
        
        // 设置初始进度
        this.updateProgress(this.progress);

        // 创建文本显示
        this.textEl = contentEl.createEl('div', { text: this.text, cls: 'modal-text' });
    }

    updateProgress(progress: number, text?: string) {
        this.progress = progress;
        
        // 使用CSS类来表示进度
        // 首先移除所有现有的进度类
        for (let i = 0; i <= 100; i += 5) {
            this.progressValueEl.removeClass(`progress-${i}`);
        }
        
        // 将进度四舍五入到最接近的5的倍数
        const roundedProgress = Math.round(progress / 5) * 5;
        
        // 添加新的进度类
        this.progressValueEl.addClass(`progress-${roundedProgress}`);
        
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