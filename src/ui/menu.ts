import { Menu, TFile } from 'obsidian';
import EncryptAllPlugin from '../main';

export class EncryptMenu {
    private plugin: EncryptAllPlugin;

    constructor(plugin: EncryptAllPlugin) {
        this.plugin = plugin;
    }

    /**
     * 添加菜单项
     * @param menu 菜单对象
     * @param file 文件对象
     */
    async addMenuItems(menu: Menu, file: TFile): Promise<void> {
        try {
            // 只处理 Markdown 文件
            if (file.extension !== 'md') {
                // console.log(`[EncryptAll] Skipping non-markdown file: ${file.path}`);
                return;
            }

            // console.log(`[EncryptAll] Adding menu items for file: ${file.path}`);
            
            // 检查文件是否已加密
            const isEncrypted = await this.plugin.fileManager.isEncrypted(file);
            // console.log(`[EncryptAll] File ${file.path} is ${isEncrypted ? 'encrypted' : 'not encrypted'}`);
            
            if (isEncrypted) {
                // 如果文件已加密，只显示解密选项
                // console.log(`[EncryptAll] Adding decrypt menu item for file: ${file.path}`);
                menu.addItem((item) => {
                    item
                        .setTitle('Decrypt file')
                        .setIcon('unlock')
                        .onClick(async () => {
                            try {
                                await this.plugin.decryptFile(file);
                            } catch (error) {
                                console.error('[EncryptAll] Error decrypting file:', error);
                            }
                        });
                });
            } else {
                // 如果文件未加密，只显示加密选项
                // console.log(`[EncryptAll] Adding encrypt menu item for file: ${file.path}`);
                menu.addItem((item) => {
                    item
                        .setTitle('Encrypt file')
                        .setIcon('lock')
                        .onClick(async () => {
                            try {
                                await this.plugin.encryptFile(file);
                            } catch (error) {
                                console.error('[EncryptAll] Error encrypting file:', error);
                            }
                        });
                });
            }
        } catch (error) {
            console.error('[EncryptAll] Error in addMenuItems:', error);
            throw error;
        }
    }
} 