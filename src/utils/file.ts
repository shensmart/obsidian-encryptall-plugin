import { App, TFile, Vault, TAbstractFile } from 'obsidian';
import { 
    encryptBinary, 
    decryptBinary, 
    generateRandomFileName,
    getEncryptedFileName,
    importFileNameMap,
    encrypt,
    decrypt,
    addAttachmentsMark,
    removeAttachmentsMark,
    FileMapping
} from './encrypt';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * 获取加密后的文件路径
 * @param originalPath 原始文件路径
 * @param encryptedName 加密后的文件名
 * @returns 加密后的完整路径
 */
function getEncryptedPath(originalPath: string, encryptedName: string): string {
    const parentPath = path.dirname(originalPath);
    return path.join(parentPath, encryptedName);
}

export class FileManager {
    private app: App;
    private tempDir: string;

    constructor(app: App) {
        this.app = app;
        // 在系统临时目录下创建插件的临时目录
        this.tempDir = path.join(os.tmpdir(), 'obsidian-encryptall-plugin');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 生成临时文件路径
     * @param originalPath 原始文件路径
     * @returns 临时文件路径
     */
    private getTempPath(originalPath: string): string {
        const tempDir = os.tmpdir();
        const fileName = path.basename(originalPath);
        return path.join(tempDir, `encryptall-${fileName}`);
    }

    /**
     * 清理临时文件
     * @param tempPath 临时文件路径
     */
    private async cleanupTempFile(tempPath: string): Promise<void> {
        try {
            const tempFile = this.app.vault.getAbstractFileByPath(tempPath);
            if (tempFile instanceof TFile) {
                await this.app.fileManager.trashFile(tempFile);
            }
        } catch (error) {
            console.error(`[EncryptAll] Failed to cleanup temp file: ${tempPath}`, error);
        }
    }

    /**
     * 清理所有临时文件
     */
    private async cleanupAllTempFiles(): Promise<void> {
        try {
            const files = fs.readdirSync(this.tempDir);
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                await this.cleanupTempFile(filePath);
            }
        } catch (error) {
            console.error('[EncryptAll] Error cleaning up temp files:', error);
        }
    }

    /**
     * 生成加密文件名，保持原文件名不变
     * @param file 原始文件对象
     * @returns 原始文件名
     */
    generateEncryptedName(file: TFile): string {
        return file.name;
    }

    /**
     * 生成随机文件名
     * @param originalName 原始文件名
     * @returns 随机文件名
     */
    generateRandomName(originalName: string): string {
        const ext = originalName.split('.').pop() || '';
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `${randomStr}.${ext}`;
    }

    /**
     * 从加密文件名中获取原始文件名
     * @param encryptedPath 加密文件路径
     * @returns 原始文件名
     */
    getOriginalName(encryptedPath: string): string {
        // 从文件内容中获取原始文件名
        return encryptedPath;
    }

    /**
     * 检查文件是否已加密
     * @param file 文件对象
     * @returns 是否已加密
     */
    async isEncrypted(file: TFile): Promise<boolean> {
        try {
            // console.log(`[EncryptAll] Checking if file is encrypted: ${file.path}`);
            const content = await this.app.vault.read(file);
            const isEncrypted = content.startsWith('ENCRYPTED:');
            // console.log(`[EncryptAll] File ${file.path} is ${isEncrypted ? 'encrypted' : 'not encrypted'}`);
            // console.log(`[EncryptAll] Content starts with: ${content.substring(0, 20)}`);
            return isEncrypted;
        } catch (error) {
            console.error(`[EncryptAll] Error checking encryption status: ${file.path}`, error);
            return false;
        }
    }

    /**
     * 查找 Markdown 内容中的附件链接（支持 [[...]] 和 ![](...) 格式）
     * @param content Markdown 内容
     * @param parentPath 附件所在的父目录路径
     * @param mapObj 文件映射表
     * @returns 附件文件对象数组
     */
    async findAttachmentsInContent(content: string, parentPath: string, mapObj: Record<string, FileMapping>): Promise<TFile[]> {
        const attachments: TFile[] = [];
        
        // 匹配 ![[附件名]] 格式
        const wikiLinkRegex = /!\[\[(.*?)\]\]/g;
        // 匹配 ![描述](路径) 格式
        const markdownLinkRegex = /!\[.*?\]\((.*?)\)/g;
        
        // console.log('[EncryptAll] Finding attachments in content');
        // console.log('[EncryptAll] Parent path:', parentPath);
        // console.log('[EncryptAll] Content:', content);

        // 处理 ![[附件名]] 格式
        let match;
        while ((match = wikiLinkRegex.exec(content)) !== null) {
            const attachmentName = match[1];
            // console.log('[EncryptAll] Found wiki link attachment:', attachmentName);
            await this.processAttachment(attachmentName, parentPath, attachments, mapObj);
        }

        // 处理 ![描述](路径) 格式
        while ((match = markdownLinkRegex.exec(content)) !== null) {
            const attachmentPath = match[1];
            // console.log('[EncryptAll] Found markdown link attachment:', attachmentPath);
            await this.processAttachment(attachmentPath, parentPath, attachments, mapObj);
        }

        // console.log('[EncryptAll] Total attachments found:', attachments.length);
        return attachments;
    }

    /**
     * 处理单个附件
     * @param attachmentPath 附件路径
     * @param parentPath 父目录路径
     * @param attachments 附件数组
     * @param mapObj 文件映射表
     */
    private async processAttachment(attachmentPath: string, parentPath: string, attachments: TFile[], mapObj: Record<string, FileMapping>): Promise<void> {
        // 检查是否是加密的附件（主文档文件名_随机字符串格式）
        const isEncryptedAttachment = /^.*_[a-f0-9]{32}$/.test(attachmentPath);
        // console.log('[EncryptAll] Is encrypted attachment:', isEncryptedAttachment);

        if (isEncryptedAttachment) {
            // 对于加密的附件，从映射表中查找对应的映射
            let foundMapping = null;
            for (const [_, mapping] of Object.entries(mapObj)) {
                if (mapping.encryptedPath.endsWith(attachmentPath)) {
                    foundMapping = mapping;
                    break;
                }
            }

            if (foundMapping) {
                // console.log('[EncryptAll] Found mapping for encrypted attachment:', foundMapping);
                const file = this.app.vault.getAbstractFileByPath(foundMapping.encryptedPath);
                if (file instanceof TFile) {
                    // console.log('[EncryptAll] Found encrypted attachment at path:', foundMapping.encryptedPath);
                    attachments.push(file);
                    return;
                } else {
                    // console.log('[EncryptAll] Encrypted attachment not found at path:', foundMapping.encryptedPath);
                }
            }
        } else {
            // 对于未加密的附件，先检查是否在映射表中
            let foundMapping = null;
            for (const [_, mapping] of Object.entries(mapObj)) {
                if (mapping.originalPath === attachmentPath) {
                    foundMapping = mapping;
                    break;
                }
            }

            if (foundMapping) {
                // console.log('[EncryptAll] Found mapping for original attachment:', foundMapping);
                const file = this.app.vault.getAbstractFileByPath(foundMapping.encryptedPath);
                if (file instanceof TFile) {
                    // console.log('[EncryptAll] Found encrypted attachment at path:', foundMapping.encryptedPath);
                    attachments.push(file);
                    return;
                }
            }

            // 如果不在映射表中，使用 metadataCache 查找
            try {
                const attachmentFile = this.app.metadataCache.getFirstLinkpathDest(attachmentPath, parentPath);
                if (attachmentFile instanceof TFile) {
                    // console.log('[EncryptAll] Found attachment using metadataCache:', attachmentFile.path);
                    attachments.push(attachmentFile);
                    return;
                }
            } catch (error) {
                // console.log('[EncryptAll] Error using metadataCache:', error);
            }

            // 如果 metadataCache 查找失败，尝试直接使用附件路径
            const file = this.app.vault.getAbstractFileByPath(attachmentPath);
            if (file instanceof TFile) {
                // console.log('[EncryptAll] Found attachment at path:', attachmentPath);
                attachments.push(file);
            } else {
                // console.log('[EncryptAll] Attachment not found:', attachmentPath);
            }
        }
    }

    /**
     * 更新 Markdown 内容中的附件链接
     * @param content Markdown 内容
     * @param oldName 旧文件名
     * @param newName 新文件名
     * @returns 更新后的内容
     */
    public updateAttachmentLinks(content: string, oldName: string, newName: string): string {
        // 处理 ![[文件名]] 格式
        const wikiLinkRegex = new RegExp(`!\\[\\[${oldName}\\]\\]`, 'g');
        content = content.replace(wikiLinkRegex, `![[${newName}]]`);
        
        // 处理 ![描述](路径) 格式
        const markdownLinkRegex = new RegExp(`!\\[.*?\\]\\(${oldName}\\)`, 'g');
        content = content.replace(markdownLinkRegex, (match, p1) => {
            // 保持原有的描述文本
            const description = match.match(/!\[(.*?)\]/)?.[1] || '';
            return `![${description}](${newName})`;
        });
        
        return content;
    }

    /**
     * 加密文件及其附件
     * @param file 要加密的文件
     * @param password 密码
     * @param onProgress 进度条回调函数
     * @returns 加密后的内容
     */
    async encryptFileWithAttachments(file: TFile, password: string, onProgress?: (progress: number, text: string) => void): Promise<{ content: string, attachmentCount: number }> {
        const tempFiles = new Map<string, { tempPath: string, encryptedPath: string, originalPath: string, originalName: string }>();
        const encryptedAttachments: string[] = [];
        const mapObj: Record<string, FileMapping> = {};
        const attachmentMap = new Map<string, string>();
        try {
            let content = await this.app.vault.read(file);
            const attachmentsToEncrypt = await this.findAttachmentsInContent(content, file.parent?.path || '', mapObj);
            const totalAttachments = attachmentsToEncrypt.length;
            let processedAttachments = 0;

            for (const attachment of attachmentsToEncrypt) {
                try {
                    if (attachmentMap.has(attachment.path)) {
                        const encryptedName = attachmentMap.get(attachment.path);
                        if (encryptedName) {
                            content = this.updateAttachmentLinks(content, attachment.name, encryptedName);
                        }
                        continue;
                    }
                    const encryptedName = generateRandomFileName(file.basename);
                    const encryptedAttachmentPath = getEncryptedPath(attachment.path, encryptedName);
                    const tempPath = path.join(os.tmpdir(), encryptedName);
                    const attachmentData = await this.app.vault.readBinary(attachment);
                    const encryptedData = await encryptBinary(attachmentData, password);
                    fs.writeFileSync(tempPath, Buffer.from(encryptedData));
                    mapObj[encryptedName] = {
                        originalPath: attachment.path,
                        encryptedName,
                        encryptedPath: encryptedAttachmentPath,
                        originalName: attachment.name,
                        parentPath: file.parent?.path || '',
                        fileType: path.extname(attachment.name)
                    };
                    attachmentMap.set(attachment.path, encryptedName);
                    content = this.updateAttachmentLinks(content, attachment.name, encryptedName);
                    tempFiles.set(attachment.path, { tempPath, encryptedPath: encryptedAttachmentPath, originalPath: attachment.path, originalName: attachment.name });
                    encryptedAttachments.push(`![[${encryptedAttachmentPath}]]`);
                    processedAttachments++;
                    if (onProgress) {
                        onProgress((processedAttachments / totalAttachments) * 100, `正在加密附件 ${processedAttachments}/${totalAttachments}`);
                    }
                } catch (error) {
                    console.error(`[EncryptAll] Failed to encrypt attachment: ${attachment.path}`, error);
                    throw new Error(`Failed to encrypt attachment ${attachment.path}: ${error.message}`);
                }
            }
            const mapStr = `<!--ENCRYPT_MAP:${JSON.stringify(mapObj)}-->
`;
            content = mapStr + content;
            const encrypted = await encrypt(content, password);
            const finalContent = addAttachmentsMark(encrypted, encryptedAttachments);
            for (const { tempPath, encryptedPath, originalPath } of tempFiles.values()) {
                const originalFile = this.app.vault.getAbstractFileByPath(originalPath);
                if (originalFile instanceof TFile) {
                    await this.app.fileManager.trashFile(originalFile);
                }
                const encryptedBuffer = fs.readFileSync(tempPath);
                await this.app.vault.createBinary(encryptedPath, encryptedBuffer);
                fs.unlinkSync(tempPath);
            }
            await this.cleanupAllTempFiles();
            return { content: finalContent, attachmentCount: encryptedAttachments.length };
        } catch (error) {
            for (const { tempPath } of tempFiles.values()) {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
            throw error;
        }
    }

    /**
     * 解密文件及其附件
     * @param file 要解密的文件
     * @param password 密码
     * @param onProgress 进度条回调函数
     * @returns 解密后的内容
     */
    async decryptFileWithAttachments(file: TFile, password: string, onProgress?: (progress: number, text: string) => void): Promise<{
        decryptedContent: string;
        tempFiles: Map<string, { tempPath: string, originalPath: string, encryptedPath: string }>;
        mapObj: Record<string, FileMapping>;
    }> {
        const tempFiles = new Map<string, { tempPath: string, originalPath: string, encryptedPath: string }>();
        let mapObj: Record<string, FileMapping> = {};
        let decryptedContentStr = '';
        try {
            const content = await this.app.vault.read(file);
            if (!content.startsWith('ENCRYPTED:')) {
                throw new Error('File is not encrypted');
            }
            const { content: encryptedContent, attachments } = removeAttachmentsMark(content);
            decryptedContentStr = await decrypt(encryptedContent, password);
            const mapMatch = decryptedContentStr.match(/^<!--ENCRYPT_MAP:(.*?)-->/);
            if (mapMatch) {
                try {
                    mapObj = importFileNameMap(JSON.parse(mapMatch[1]));
                    decryptedContentStr = decryptedContentStr.replace(/^<!--ENCRYPT_MAP:(.*?)-->\n?/, '');
                } catch (e) {
                    console.error('[EncryptAll] Failed to parse ENCRYPT_MAP:', e);
                }
            } else {
                mapObj = {};
            }
            const attachmentsToDecrypt = await this.findAttachmentsInContent(decryptedContentStr, file.parent?.path || '', mapObj);
            const totalAttachments = attachmentsToDecrypt.length;
            let processedAttachments = 0;

            for (const attachment of attachmentsToDecrypt) {
                try {
                    const mapping = mapObj[attachment.name];
                    if (!mapping) {
                        console.error(`[EncryptAll] No mapping found for attachment: ${attachment.name}`);
                        continue;
                    }
                    const originalPath = mapping.originalPath;
                    const encryptedPath = mapping.encryptedPath;
                    const tempPath = path.join(this.tempDir, generateRandomFileName());
                    tempFiles.set(attachment.name, { tempPath, originalPath, encryptedPath });
                    const encryptedContent = await this.app.vault.readBinary(attachment);
                    const decryptedAttachmentContent = await decryptBinary(encryptedContent, password);
                    fs.writeFileSync(tempPath, Buffer.from(decryptedAttachmentContent));
                    decryptedContentStr = this.updateAttachmentLinks(decryptedContentStr, attachment.name, mapping.originalName);
                    processedAttachments++;
                    if (onProgress) {
                        onProgress((processedAttachments / totalAttachments) * 100, `正在解密附件 ${processedAttachments}/${totalAttachments}`);
                    }
                } catch (error) {
                    console.error(`[EncryptAll] Failed to decrypt attachment: ${attachment.path}`, error);
                    throw new Error(`Failed to decrypt attachment ${attachment.path}: ${error.message}`);
                }
            }
            return {
                decryptedContent: decryptedContentStr,
                tempFiles,
                mapObj
            };
        } catch (error) {
            for (const { tempPath } of tempFiles.values()) {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
            throw error;
        }
    }

    /**
     * 将解密后的内容写入 vault
     * @param file 要写入的文件
     * @param decryptedContent 解密后的内容
     * @param tempFiles 临时文件信息
     */
    async writeDecryptedContent(
        file: TFile,
        decryptedContent: string,
        tempFiles: Map<string, { tempPath: string, originalPath: string, encryptedPath: string }>
    ): Promise<void> {
        try {
            // 1. 写入正文内容
            await this.app.vault.modify(file, decryptedContent);
            
            // 2. 写入附件并删除加密附件
            for (const { tempPath, originalPath, encryptedPath } of tempFiles.values()) {
                // 删除加密附件
                const encryptedFile = this.app.vault.getAbstractFileByPath(encryptedPath);
                if (encryptedFile instanceof TFile) {
                    await this.app.fileManager.trashFile(encryptedFile);
                }
                // 读取临时文件内容
                const decryptedBuffer = fs.readFileSync(tempPath);
                await this.app.vault.createBinary(originalPath, decryptedBuffer);
                // 删除临时文件
                fs.unlinkSync(tempPath);
            }
            // 清理所有临时文件
            await this.cleanupAllTempFiles();
        } catch (error) {
            // 如果写入失败，只清理临时文件，不动 vault
            console.error('[EncryptAll] Error during transactional write:', error);
            for (const { tempPath } of tempFiles.values()) {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
            throw error;
        }
    }
} 