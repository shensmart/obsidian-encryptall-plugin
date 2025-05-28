import CryptoJS from 'crypto-js';
import pako from 'pako';

// 生成随机文件名
export function generateRandomFileName(mainFileName?: string): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomStr = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return mainFileName ? `${mainFileName}_${randomStr}` : randomStr;
}

// 压缩文本内容
function compressText(text: string): string {
    const compressed = pako.deflate(text);
    return btoa(String.fromCharCode.apply(null, compressed));
}

// 解压缩文本内容
function decompressText(compressed: string): string {
    const binaryString = atob(compressed);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes);
    return new TextDecoder().decode(decompressed);
}

// 存储加密文件名为 key 的映射
export interface FileMapping {
    originalPath: string;
    encryptedName: string;
    encryptedPath: string;
    originalName: string;  // 添加原始文件名
    parentPath: string;    // 添加父目录路径
    fileType: string;      // 添加文件类型
}

// 获取加密后的文件名
export function getEncryptedFileName(originalPath: string, encryptedPath: string): FileMapping {
    const encryptedName = encryptedPath.split("/").pop() || "";
    const originalName = originalPath.split('/').pop() || '';
    const parentPath = originalPath.substring(0, originalPath.lastIndexOf('/'));
    const fileType = originalName.split('.').pop() || '';
    return {
        originalPath,
        encryptedName,
        encryptedPath,
        originalName,
        parentPath,
        fileType
    };
}

// 获取原始文件名（通过加密名查找）
export function getOriginalFileName(encryptedName: string, mapObj: Record<string, FileMapping>): string {
    const mapping = mapObj[encryptedName];
    return mapping ? mapping.originalPath : encryptedName;
}

// 获取加密后的完整路径（通过加密名查找）
export function getEncryptedPath(encryptedName: string, mapObj: Record<string, FileMapping>): string {
    const mapping = mapObj[encryptedName];
    return mapping ? mapping.encryptedPath : encryptedName;
}

// 导出映射表为对象（key 为加密名）
export function exportFileNameMap(mapObj: Record<string, FileMapping>): Record<string, FileMapping> {
    return mapObj;
}

// 从对象导入映射表
export function importFileNameMap(obj: Record<string, any>): Record<string, FileMapping> {
    const result: Record<string, FileMapping> = {};
    for (const encryptedName in obj) {
        const entry = obj[encryptedName];
        result[encryptedName] = {
            originalPath: entry.originalPath || encryptedName,
            encryptedName,
            encryptedPath: entry.encryptedPath,
            originalName: entry.originalName || '',
            parentPath: entry.parentPath || '',
            fileType: entry.fileType || ''
        };
    }
    return result;
}

export async function encrypt(content: string, password: string): Promise<string> {
    try {
        // 压缩内容
        const compressedContent = compressText(content);
        
        // 使用 WordArray 来确保正确处理加密数据
        const encrypted = CryptoJS.AES.encrypt(compressedContent, password, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
            iv: CryptoJS.enc.Utf8.parse('0000000000000000')  // 使用固定的IV
        });
        
        // 将加密结果转换为 Base64 字符串
        const encryptedBase64 = encrypted.toString();
        
        // 确保添加 ENCRYPTED: 前缀
        const result = 'ENCRYPTED:' + encryptedBase64;
        
        return result;
    } catch (error) {
        throw new Error('Encryption failed: ' + error.message);
    }
}

// 添加附件标记到加密内容
export function addAttachmentsMark(content: string, attachments: string[]): string {
    if (attachments.length === 0) return content;
    return content + '\n\nATTACHMENTS: ' + attachments.join(', ');
}

// 从加密内容中移除附件标记
export function removeAttachmentsMark(content: string): { content: string; attachments: string[] } {
    const attachmentsMatch = content.match(/ATTACHMENTS: (.*?)$/);
    if (!attachmentsMatch) {
        return { content, attachments: [] };
    }
    
    const attachments = attachmentsMatch[1].split(',').map(s => s.trim());
    const cleanContent = content.replace(/ATTACHMENTS: .*?$/, '').trim();
    return { content: cleanContent, attachments };
}

export async function decrypt(content: string, password: string): Promise<string> {
    try {
        if (!content.startsWith('ENCRYPTED:')) {
            throw new Error('Content is not encrypted');
        }
        
        const encryptedContent = content.substring('ENCRYPTED:'.length);
        
        // 使用相同的加密配置进行解密
        const decrypted = CryptoJS.AES.decrypt(encryptedContent, password, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
            iv: CryptoJS.enc.Utf8.parse('0000000000000000')  // 使用相同的固定IV
        });
        
        // 解密后转为字符串，使用 Latin1 编码处理二进制数据
        const decryptedStr = decrypted.toString(CryptoJS.enc.Latin1);
        
        if (!decryptedStr || decryptedStr === '' || decryptedStr === 'undefined') {
            throw new Error('Decryption failed - wrong password or corrupted content');
        }
        
        // 解压缩内容
        const decompressedContent = decompressText(decryptedStr);
        
        return decompressedContent;
    } catch (error) {
        throw new Error('Decryption failed: ' + (error instanceof Error ? error.message : String(error)));
    }
}

// 二进制加密
export async function encryptBinary(data: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    try {
        // 将 ArrayBuffer 转换为 WordArray
        const wordArray = CryptoJS.lib.WordArray.create(new Uint8Array(data));
        
        // 生成随机 salt
        const salt = CryptoJS.lib.WordArray.random(128/8);
        
        // 使用 PBKDF2 生成密钥
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: 256/32,
            iterations: 1000
        });
        
        // 生成随机 IV
        const iv = CryptoJS.lib.WordArray.random(128/8);
        
        // 使用 CBC 模式加密
        const encrypted = CryptoJS.AES.encrypt(wordArray, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        
        // 组合 salt、IV 和密文
        const result = CryptoJS.lib.WordArray.create()
            .concat(salt)  // 先放 salt
            .concat(iv)    // 再放 IV
            .concat(encrypted.ciphertext);  // 最后放密文
        
        // 转换为 ArrayBuffer
        const resultBytes = new Uint8Array(result.words.length * 4);
        for (let i = 0; i < result.words.length; i++) {
            const word = result.words[i];
            resultBytes[i * 4] = (word >>> 24) & 0xff;
            resultBytes[i * 4 + 1] = (word >>> 16) & 0xff;
            resultBytes[i * 4 + 2] = (word >>> 8) & 0xff;
            resultBytes[i * 4 + 3] = word & 0xff;
        }
        
        return resultBytes.buffer;
    } catch (error) {
        throw new Error('Binary encryption failed: ' + error.message);
    }
}

// 二进制解密
export async function decryptBinary(data: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    try {
        // 将 ArrayBuffer 转换为 WordArray
        const bytes = new Uint8Array(data);
        const words = [];
        for (let i = 0; i < bytes.length; i += 4) {
            let word = 0;
            for (let j = 0; j < 4 && i + j < bytes.length; j++) {
                word = (word << 8) | bytes[i + j];
            }
            words.push(word);
        }
        const wordArray = CryptoJS.lib.WordArray.create(words);
        
        // 提取 salt（前16字节）、IV（接下来16字节）和密文
        const salt = CryptoJS.lib.WordArray.create(wordArray.words.slice(0, 4));
        const iv = CryptoJS.lib.WordArray.create(wordArray.words.slice(4, 8));
        const ciphertext = CryptoJS.lib.WordArray.create(wordArray.words.slice(8));
        
        // 使用提取的 salt 生成密钥
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: 256/32,
            iterations: 1000
        });
        
        // 使用 CBC 模式解密
        const decrypted = CryptoJS.AES.decrypt(
            CryptoJS.lib.CipherParams.create({ ciphertext }),
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );
        
        // 将解密结果转换回 ArrayBuffer
        const decryptedBytes = new Uint8Array(decrypted.words.length * 4);
        for (let i = 0; i < decrypted.words.length; i++) {
            const word = decrypted.words[i];
            decryptedBytes[i * 4] = (word >>> 24) & 0xff;
            decryptedBytes[i * 4 + 1] = (word >>> 16) & 0xff;
            decryptedBytes[i * 4 + 2] = (word >>> 8) & 0xff;
            decryptedBytes[i * 4 + 3] = word & 0xff;
        }
        
        // 移除填充的零字节
        let actualLength = decryptedBytes.length;
        while (actualLength > 0 && decryptedBytes[actualLength - 1] === 0) {
            actualLength--;
        }
        
        return decryptedBytes.slice(0, actualLength).buffer;
    } catch (error) {
        throw new Error('Binary decryption failed: ' + error.message);
    }
} 