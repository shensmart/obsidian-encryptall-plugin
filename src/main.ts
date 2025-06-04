import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { EncryptAllSettings, DEFAULT_SETTINGS, EncryptAllSettingTab } from './settings';
import { FileManager } from './utils/file';
import { TimeManager } from './utils/time';
import { EncryptMenu } from './ui/menu';
import { PasswordModal } from './ui/modal';
import { 
    encrypt, 
    decrypt, 
    encryptBinary, 
    decryptBinary, 
    getEncryptedFileName, 
    getOriginalFileName, 
    getEncryptedPath, 
    importFileNameMap, 
    generateRandomFileName,
    FileMapping,
    addAttachmentsMark,
    removeAttachmentsMark
} from './utils/encrypt';
import CryptoJS from 'crypto-js';
import { getLanguage } from './i18n';
import { ProgressBar } from './ui/progressBar';
import { Buffer } from 'buffer';
import * as pako from 'pako';

export default class EncryptAllPlugin extends Plugin {
    public fileManager: FileManager;
    private timeManager: TimeManager;
    private encryptMenu: EncryptMenu;
    private encryptedFiles: Set<string>;
    private fileStatusCache: Map<string, boolean>;
    private passwordCache: Map<string, string>;
    lastActiveFile: TFile | null = null;
    settings: EncryptAllSettings;
    private idleTimers: Map<string, NodeJS.Timeout>;
    private encryptingFiles: Set<string> = new Set();
    private statusBarItemEl: HTMLElement;

    async onload() {
        await this.loadSettings();
        
        // 初始化各个管理器
        this.fileManager = new FileManager(this.app);
        this.timeManager = new TimeManager(this.settings.autoEncryptTimeout);
        this.encryptMenu = new EncryptMenu(this);
        this.encryptedFiles = new Set<string>();
        this.fileStatusCache = new Map<string, boolean>();
        this.passwordCache = new Map<string, string>();
        this.idleTimers = new Map<string, NodeJS.Timeout>();

        // 添加设置标签页
        this.addSettingTab(new EncryptAllSettingTab(this.app, this));

        // 注册命令
        this.addCommand({
            id: 'encrypt-file',
            name: getLanguage(this.settings.language).encrypt.menu.encrypt,
            callback: async () => {
                const file = this.app.workspace.getActiveFile();
                if (file instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(file);
                        if (!content.startsWith('ENCRYPTED:')) {
                            await this.encryptFile(file);
                            this.fileStatusCache.set(file.path, true);
                        }
                    } catch (error) {
                        console.error('[EncryptAll] Error reading file:', error);
                    }
                }
            }
        });

        this.addCommand({
            id: 'decrypt-file',
            name: getLanguage(this.settings.language).encrypt.menu.decrypt,
            callback: async () => {
                const file = this.app.workspace.getActiveFile();
                if (file instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(file);
                        if (content.startsWith('ENCRYPTED:')) {
                            await this.decryptFile(file);
                            this.fileStatusCache.set(file.path, false);
                        }
                    } catch (error) {
                        console.error('[EncryptAll] Error reading file:', error);
                    }
                }
            }
        });

        // 注册编辑器变化事件
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, view) => {
                if (!view || !(view instanceof MarkdownView) || !view.file) return;
                const file = view.file;
                if (this.isEncrypted(file.path)) return;
                // 检查是否有缓存密码
                const cachedPassword = this.passwordCache.get(file.path);
                if (!cachedPassword) return;
                // 重置该文件的空闲计时器
                if (this.idleTimers.has(file.path)) {
                    console.log(`[EncryptAll] 清除文件 ${file.path} 的空闲计时器`);
                    clearTimeout(this.idleTimers.get(file.path));
                }
                console.log(`[EncryptAll] 添加文件 ${file.path} 的空闲计时器`);
                this.idleTimers.set(file.path, setTimeout(async () => {
                    // 检查文件是否仍然存在且未加密
                    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (currentFile instanceof TFile) {
                        try {
                            const content = await this.app.vault.read(currentFile);
                            if (!content.startsWith('ENCRYPTED:')) {
                                await this.encryptFileWithPassword(currentFile, cachedPassword);
                            }
                        } catch (error) {
                            // 忽略文件删除错误，不影响加密流程
                            if (error.code !== 'ENOENT') {
                                console.error('[EncryptAll] Encryption error:', error);
                            }
                        }
                    }
                }, this.settings.autoEncryptTimeout * 1000));
            })
        );

        // 注册标签页切换事件
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (!leaf || !(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
                const file = leaf.view.file;
                if (this.isEncrypted(file.path)) return;
                // 检查是否有缓存密码
                const cachedPassword = this.passwordCache.get(file.path);
                if (!cachedPassword) return;
                // 重置该文件的空闲计时器
                if (this.idleTimers.has(file.path)) {
                    console.log(`[EncryptAll] 清除文件 ${file.path} 的空闲计时器`);
                    clearTimeout(this.idleTimers.get(file.path));
                }
                console.log(`[EncryptAll] 添加文件 ${file.path} 的空闲计时器`);
                this.idleTimers.set(file.path, setTimeout(async () => {
                    // 检查文件是否仍然存在且未加密
                    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (currentFile instanceof TFile) {
                        try {
                            const content = await this.app.vault.read(currentFile);
                            if (!content.startsWith('ENCRYPTED:')) {
                                await this.encryptFileWithPassword(currentFile, cachedPassword);
                            }
                        } catch (error) {
                            // 忽略文件删除错误，不影响加密流程
                            if (error.code !== 'ENOENT') {
                                console.error('[EncryptAll] Encryption error:', error);
                            }
                        }
                    }
                }, this.settings.autoEncryptTimeout * 1000));
            })
        );

        // 注册文件打开事件
        this.registerEvent(
            this.app.workspace.on('file-open', async (file) => {
                // 更新 lastActiveFile
                if (file instanceof TFile) {
                    this.lastActiveFile = file;
                    
                    // 如果文件在加密缓存中，启动定时器
                    const lastPassword = this.encryptedFiles.has(file.path);
                    if (lastPassword) {
                        const startTime = new Date();
                        const triggerTime = new Date(startTime.getTime() + this.settings.autoEncryptTimeout * 1000);
                        
                        this.timeManager.setTimer(file.path, async () => {
                            try {
                                const now = new Date();
                                
                                // 检查文件是否已经加密
                                const content = await this.app.vault.read(file);
                                if (content.startsWith('ENCRYPTED:')) {
                                    return;
                                }

                                // 获取缓存的密码
                                const cachedPassword = this.passwordCache.get(file.path);
                                if (!cachedPassword) {
                                    return;
                                }

                                await this.encryptFileWithPassword(file, cachedPassword);
                                new Notice(`文件 "${file.basename}" 已自动加密`);
                            } catch (error) {
                                console.error(`[EncryptAll] Error auto encrypting file: ${file.path}`, error);
                            }
                        });
                    }
                } else {
                    this.lastActiveFile = null;
                }
            })
        );

        // 注册文件关闭事件
        this.registerEvent(
            this.app.workspace.on('layout-change', async () => {
                // 获取所有打开的标签页
                const leaves = this.app.workspace.getLeavesOfType('markdown');
                // 获取所有打开的文件路径
                const openFiles = new Set(leaves.map(leaf => {
                    const view = leaf.view as MarkdownView;
                    return view?.file?.path;
                }).filter(Boolean));

                // 获取所有有密码缓存的文件
                const cachedFiles = Array.from(this.passwordCache.keys());
                
                // 检查每个有密码缓存的文件是否被关闭
                for (const filePath of cachedFiles) {
                    if (!openFiles.has(filePath)) {
                        try {
                            const file = this.app.vault.getAbstractFileByPath(filePath);
                            if (file instanceof TFile) {
                                // 清除定时器
                                this.timeManager.clearTimer(filePath);

                                // 获取缓存的密码
                                const cachedPassword = this.passwordCache.get(filePath);
                                if (cachedPassword) {
                                    // 检查文件是否已经加密
                                    const content = await this.app.vault.read(file);
                                    if (!content.startsWith('ENCRYPTED:')) {
                                        // 显示提示信息
                                        new Notice(`文件 "${file.basename}" 已关闭，将在3秒后自动加密...`, 3000);
                                        
                                        // 延迟3秒后执行加密
                                        setTimeout(async () => {
                                            try {
                                                // 使用缓存的密码直接加密，不显示进度条
                                                await this.encryptFileWithPassword(file, cachedPassword);
                                                new Notice(`文件 "${file.basename}" 已自动加密`);
                                            } catch (error) {
                                                console.error(`[EncryptAll] Error auto encrypting file: ${file.path}`, error);
                                                new Notice(`文件 "${file.basename}" 自动加密失败：${error.message}`);
                                            }
                                        }, 3000);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`[EncryptAll] Error checking file: ${filePath}`, error);
                        }
                    }
                }
            })
        );

        // 注册文件菜单事件
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile) {
                    // 只处理 Markdown 文件
                    if (file.extension !== 'md') {
                        return;
                    }

                    // 使用缓存判断文件状态
                    const isEncrypted = this.fileStatusCache.get(file.path) ?? false;
                    
                    const t = getLanguage(this.settings.language).encrypt;
                    
                    if (isEncrypted) {
                        menu.addItem((item) => {
                            item
                                .setTitle(t.menu.decrypt)
                                .setIcon('unlock')
                                .onClick(async () => {
                                    try {
                                        await this.decryptFile(file);
                                    } catch (error) {
                                        console.error('[EncryptAll] Error decrypting file:', error);
                                    }
                                });
                        });
                    } else {
                        menu.addItem((item) => {
                            item
                                .setTitle(t.menu.encrypt)
                                .setIcon('lock')
                                .onClick(async () => {
                                    try {
                                        await this.encryptFile(file);
                                    } catch (error) {
                                        console.error('[EncryptAll] Error encrypting file:', error);
                                    }
                                });
                        });
                    }

                    // 异步更新缓存
                    this.app.vault.read(file).then(content => {
                        const isEncrypted = content.startsWith('ENCRYPTED:');
                        this.fileStatusCache.set(file.path, isEncrypted);
                    }).catch(error => {
                        console.error('[EncryptAll] Error updating cache:', error);
                    });
                }
            })
        );

        // 注册文件打开事件，更新缓存
        this.registerEvent(
            this.app.workspace.on('file-open', async (file) => {
                if (file instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(file);
                        const isEncrypted = content.startsWith('ENCRYPTED:');
                        this.fileStatusCache.set(file.path, isEncrypted);
                    } catch (error) {
                        console.error('[EncryptAll] Error updating cache:', error);
                    }
                }
            })
        );

        // 注册文件修改事件，更新缓存
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(file);
                        const isEncrypted = content.startsWith('ENCRYPTED:');
                        this.fileStatusCache.set(file.path, isEncrypted);

                        // 如果文件在加密缓存中且当前未加密，启动定时器
                        const lastPassword = this.encryptedFiles.has(file.path);
                        if (lastPassword && !isEncrypted) {
                            // 清除已存在的定时器
                            this.timeManager.clearTimer(file.path);

                            const startTime = new Date();
                            const triggerTime = new Date(startTime.getTime() + this.settings.autoEncryptTimeout * 1000);

                            // 使用箭头函数确保 this 指向正确
                            const timerCallback = async () => {
                                try {
                                    const now = new Date();

                                    // 检查文件是否已经加密
                                    const currentContent = await this.app.vault.read(file);
                                    if (currentContent.startsWith('ENCRYPTED:')) {
                                        return;
                                    }

                                    // 获取缓存的密码
                                    const cachedPassword = this.passwordCache.get(file.path);
                                    if (!cachedPassword) {
                                        return;
                                    }

                                    await this.encryptFileWithPassword(file, cachedPassword);
                                    new Notice(`文件 "${file.basename}" 已自动加密`);
                                } catch (error) {
                                    console.error(`[EncryptAll] Error auto encrypting modified file: ${file.path}`, error);
                                }
                            };

                            // 设置定时器
                            this.timeManager.setTimer(file.path, timerCallback);
                        }
                    } catch (error) {
                        console.error('[EncryptAll] Error updating cache:', error);
                    }
                }
            })
        );

        // 添加状态栏项并保存引用
        this.statusBarItemEl = this.addStatusBarItem();
        this.updateStatusBar();

        // 注册文件列表双击事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
                if (fileExplorer) {
                    const fileList = fileExplorer.view.containerEl.querySelector('.nav-files-container');
                    if (fileList) {
                        // 移除旧的事件监听器
                        fileList.removeEventListener('dblclick', this.handleFileDoubleClick);
                        // 添加新的事件监听器
                        fileList.addEventListener('dblclick', this.handleFileDoubleClick);
                    }
                }
            })
        );
    }

    onunload() {
        // 清理资源
        this.timeManager.clearAllTimers();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update TimeManager with new timeout
        this.timeManager = new TimeManager(this.settings.autoEncryptTimeout);

        // Clear existing idle timers and re-setup for active file if needed
        this.timeManager.clearAllTimers(); // Assuming TimeManager handles clearing

        // Re-setup timer for active file if auto-encrypt is enabled and conditions met
        // This part depends on how you determine if auto-encrypt is needed for the current file
        // and might require checking activeLeaf/file status.
        // For simplicity, let's assume we re-setup only for the active file.
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            // Need logic here to check if auto-encrypt is applicable to this file
            // and then call a method to set the timer, similar to what happens on file open/switch.
            // Example: this.setupIdleTimer(activeFile);
            // Since I don't have the exact setupIdleTimer logic, I'll add a placeholder comment.

            // TODO: Implement re-setup of idle timer for the active file based on new settings.
        }
    }

    /**
     * 更新状态栏
     */
    private updateStatusBar() {
        this.statusBarItemEl.setText(`已加密文件: ${this.encryptedFiles.size}`);
    }

    /**
     * 加密文件
     * @param file 要加密的文件
     */
    async encryptFile(file: TFile) {
        if (this.encryptingFiles.has(file.path)) return;
        this.encryptingFiles.add(file.path);
        try {
            const progressBar = new ProgressBar(this.app, {
                title: '加密中...',
                text: '正在加密文件...',
                progress: 0
            });
            progressBar.open();

            // 弹出密码框前先移除空闲计时器
            if (this.idleTimers.has(file.path)) {
                clearTimeout(this.idleTimers.get(file.path));
                this.idleTimers.delete(file.path);
            }

            const password = await new Promise<string | null>((resolve) => {
                new PasswordModal(this.app, this, '请输入加密密码', (result) => {
                    resolve(result);
                }).open();
            });

            if (!password) {
                progressBar.close();
                // 如果用户取消加密，重新添加空闲计时器
                const timer = setTimeout(async () => {
                    this.idleTimers.delete(file.path);
                    if (this.encryptingFiles.has(file.path)) return;
                    new Notice(`文件 ${file.basename} 已空闲超过 ${this.settings.autoEncryptTimeout} 秒，将在3秒后自动加密`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    if (this.app.workspace.getActiveFile()?.path === file.path) {
                        // 使用缓存的密码进行自动加密
                        const cachedPassword = this.passwordCache.get(file.path);
                        if (cachedPassword) {
                            await this.encryptFileWithPassword(file, cachedPassword);
                        }
                    }
                }, this.settings.autoEncryptTimeout * 1000);
                this.idleTimers.set(file.path, timer);
                return;
            }

            progressBar.updateProgress(5, '正在加密文件内容...');
            const { content: encryptedContent, attachmentCount } = await this.fileManager.encryptFileWithAttachments(file, password, (progress, text) => {
                progressBar.updateProgress(5 + Math.floor(progress * 0.9), text);
            });
            progressBar.updateProgress(95, '正在写入加密内容...');
            await this.app.vault.modify(file, encryptedContent);
            progressBar.updateProgress(100, '加密完成');
            progressBar.close();

            new Notice(`加密成功！\n共加密 ${attachmentCount} 个附件。\n请妥善保管加密后的文件和附件，确保密码安全。`, 5000);

            this.encryptedFiles.add(file.path);
            this.passwordCache.set(file.path, password);
            this.updateStatusBar();
        } catch (error) {
            console.error('[EncryptAll] Encryption error:', error);
            new Notice('加密失败：' + error.message);
        } finally {
            this.encryptingFiles.delete(file.path);
            // 清除该文件的空闲计时器
            if (this.idleTimers.has(file.path)) {
                clearTimeout(this.idleTimers.get(file.path));
                this.idleTimers.delete(file.path);
            }
        }
    }

    /**
     * 使用密码加密文件
     * @param file 要加密的文件
     * @param password 密码
     */
    private async encryptFileWithPassword(file: TFile, password: string) {
        try {
            const { content: encryptedContent, attachmentCount } = await this.fileManager.encryptFileWithAttachments(file, password);
            await this.app.vault.modify(file, encryptedContent);
            this.encryptedFiles.add(file.path);
            this.passwordCache.set(file.path, password);
            this.updateStatusBar();
        } catch (error) {
            // 忽略 ENOENT 错误，不影响加密流程
            if (error.code !== 'ENOENT') {
                console.error('[EncryptAll] Encryption error:', error);
                new Notice('加密失败：' + error.message);
            }
        }
    }

    /**
     * 解密文件
     * @param file 要解密的文件
     */
    async decryptFile(file: TFile) {
        let progressBar: ProgressBar | null = null;
        try {
            progressBar = new ProgressBar(this.app, {
                title: '解密中...',
                text: '正在解密文件...',
                progress: 0
            });
            progressBar.open();

            const password = await new Promise<string | null>((resolve) => {
                new PasswordModal(this.app, this, '请输入解密密码', (result) => {
                    resolve(result);
                }).open();
            });

            if (!password) {
                progressBar.close();
                return;
            }

            progressBar.updateProgress(5, '正在解密文件内容...');
            const { decryptedContent, tempFiles, mapObj } = await this.fileManager.decryptFileWithAttachments(file, password, (progress, text) => {
                progressBar?.updateProgress(5 + Math.floor(progress * 0.9), text);
            });
            progressBar.updateProgress(95, '正在写入解密内容...');
            await this.fileManager.writeDecryptedContent(file, decryptedContent, tempFiles);
            progressBar.updateProgress(100, '解密完成');
            progressBar.close();

            const attachmentsCount = Object.keys(mapObj).length;
            new Notice(`解密成功！\n共解密 ${attachmentsCount} 个附件。\n请确保已妥善备份解密后的文件和附件。`, 5000);

            // 更新缓存状态
            this.encryptedFiles.delete(file.path);
            this.passwordCache.set(file.path, password);  // 保存密码到缓存
            this.fileStatusCache.set(file.path, false);
            this.updateStatusBar();

            // 如果文档是激活状态但未获得输入焦点，则立即添加空闲计时器
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file?.path === file.path) {
                // 设置新的计时器
                const timer = setTimeout(async () => {
                    this.idleTimers.delete(file.path);
                    if (this.encryptingFiles.has(file.path)) return;
                    new Notice(`文件 ${file.basename} 已空闲超过 ${this.settings.autoEncryptTimeout} 秒，将在3秒后自动加密`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    // 只要文件未加密就执行加密，不再判断是否为当前激活文件
                    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (currentFile instanceof TFile) {
                        const content = await this.app.vault.read(currentFile);
                        if (!content.startsWith('ENCRYPTED:')) {
                            const cachedPassword = this.passwordCache.get(file.path);
                            if (cachedPassword) {
                                await this.encryptFileWithPassword(currentFile, cachedPassword);
                            }
                        }
                    }
                }, this.settings.autoEncryptTimeout * 1000);
                this.idleTimers.set(file.path, timer);
            } else {
                // 如果文件未激活，也添加计时器
                const timer = setTimeout(async () => {
                    this.idleTimers.delete(file.path);
                    if (this.encryptingFiles.has(file.path)) return;
                    new Notice(`文件 ${file.basename} 已空闲超过 ${this.settings.autoEncryptTimeout} 秒，将在3秒后自动加密`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    // 只要文件未加密就执行加密，不再判断是否为当前激活文件
                    const currentFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (currentFile instanceof TFile) {
                        const content = await this.app.vault.read(currentFile);
                        if (!content.startsWith('ENCRYPTED:')) {
                            const cachedPassword = this.passwordCache.get(file.path);
                            if (cachedPassword) {
                                await this.encryptFileWithPassword(currentFile, cachedPassword);
                            }
                        }
                    }
                }, this.settings.autoEncryptTimeout * 1000);
                this.idleTimers.set(file.path, timer);
            }
        } catch (error) {
            console.error('[EncryptAll] Decryption error:', error);
            // 根据错误类型给出不同的友好提示
            if (error.message.includes('Failed to execute \'atob\'')) {
                new Notice('解密失败：密码错误，请检查后重试');
            } else if (error.message.includes('File is not encrypted')) {
                // 如果文件已经解密，更新缓存状态
                this.fileStatusCache.set(file.path, false);
                new Notice('文件已经解密');
            } else {
                new Notice('解密失败：' + error.message);
            }
        } finally {
            progressBar?.close();
        }
    }

    private isEncrypted(filePath: string): boolean {
        return this.app.vault.getAbstractFileByPath(filePath)?.name.startsWith('ENCRYPTED:') || false;
    }

    /**
     * 处理文件双击事件
     * @param event 鼠标事件
     */
    private handleFileDoubleClick = async (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const fileTitle = target.closest('.nav-file-title');
        if (fileTitle) {
            const filePath = fileTitle.getAttribute('data-path');
            if (filePath) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile && file.extension === 'md') {
                    try {
                        // 检查文件内容是否加密
                        const content = await this.app.vault.read(file);
                        if (content.startsWith('ENCRYPTED:')) {
                            // 如果文件已加密，自动弹出解密对话框
                            await this.decryptFile(file);
                        }
                    } catch (error) {
                        console.error('[EncryptAll] Error checking file encryption status:', error);
                    }
                }
            }
        }
    };
}