const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取最近的改动
function getChanges() {
    try {
        const status = execSync('git status --porcelain').toString();
        const changes = status.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [status, file] = line.split(' ').filter(Boolean);
                return { status, file };
            });
        return changes;
    } catch (error) {
        console.error('Error getting git status:', error);
        return [];
    }
}

// 获取改动的文件内容
function getFileChanges(file) {
    try {
        const diff = execSync(`git diff ${file}`).toString();
        return diff;
    } catch (error) {
        console.error(`Error getting diff for ${file}:`, error);
        return '';
    }
}

// 分析文件改动
function analyzeChanges(diff) {
    const changes = {
        encryption: false,
        fileHandling: false,
        attachment: false,
        security: false,
        ui: false,
        performance: false
    };

    if (diff.includes('encrypt') || diff.includes('decrypt')) {
        changes.encryption = true;
    }
    if (diff.includes('file') || diff.includes('path') || diff.includes('vault')) {
        changes.fileHandling = true;
    }
    if (diff.includes('attachment') || diff.includes('link')) {
        changes.attachment = true;
    }
    if (diff.includes('security') || diff.includes('random') || diff.includes('password')) {
        changes.security = true;
    }
    if (diff.includes('ui') || diff.includes('modal') || diff.includes('notice')) {
        changes.ui = true;
    }
    if (diff.includes('performance') || diff.includes('optimize') || diff.includes('cache')) {
        changes.performance = true;
    }

    return changes;
}

// 生成格式化的 commit 信息
function generateCommitMessage(changes) {
    const modifiedFiles = changes.filter(c => c.status === 'M').map(c => c.file);
    const addedFiles = changes.filter(c => c.status === 'A').map(c => c.file);
    const deletedFiles = changes.filter(c => c.status === 'D').map(c => c.file);

    // 分析所有改动的文件
    const allChanges = {
        encryption: false,
        fileHandling: false,
        attachment: false,
        security: false,
        ui: false,
        performance: false
    };

    // 收集所有文件的改动内容
    let allDiffs = '';
    for (const file of modifiedFiles) {
        const diff = getFileChanges(file);
        allDiffs += diff;
        const fileChanges = analyzeChanges(diff);
        Object.keys(fileChanges).forEach(key => {
            if (fileChanges[key]) allChanges[key] = true;
        });
    }

    let message = '';

    // 添加改动摘要
    message += '改动摘要：\n';
    message += `- 修改文件数：${changes.length} 个\n`;
    message += `- 修改：${modifiedFiles.length} 个，新增：${addedFiles.length} 个，删除：${deletedFiles.length} 个\n`;
    message += `- 涉及文件：${modifiedFiles.join(', ')}\n\n`;

    // 添加详细描述
    message += '详细描述：\n';
    if (allChanges.encryption) {
        message += '- 加密相关：\n';
        if (allDiffs.includes('encryptFile')) {
            message += '  - 改进了文件加密功能\n';
        }
        if (allDiffs.includes('decryptFile')) {
            message += '  - 改进了文件解密功能\n';
        }
        if (allDiffs.includes('password')) {
            message += '  - 改进了密码处理机制\n';
        }
    }
    if (allChanges.fileHandling) {
        message += '- 文件处理：\n';
        if (allDiffs.includes('active-leaf-change')) {
            message += '  - 添加了文件关闭自动加密功能\n';
        }
        if (allDiffs.includes('getLastOpenFiles')) {
            message += '  - 改进了文件状态检测机制\n';
        }
        if (allDiffs.includes('vault.read')) {
            message += '  - 改进了文件读取逻辑\n';
        }
    }
    if (allChanges.attachment) {
        message += '- 附件处理：\n';
        if (allDiffs.includes('attachment')) {
            message += '  - 改进了附件加密功能\n';
        }
        if (allDiffs.includes('link')) {
            message += '  - 改进了附件链接处理\n';
        }
    }
    if (allChanges.security) {
        message += '- 安全性：\n';
        if (allDiffs.includes('random')) {
            message += '  - 改进了随机命名机制\n';
        }
        if (allDiffs.includes('password')) {
            message += '  - 增强了密码安全性\n';
        }
    }
    if (allChanges.ui) {
        message += '- 界面优化：\n';
        if (allDiffs.includes('modal')) {
            message += '  - 改进了密码输入界面\n';
        }
        if (allDiffs.includes('notice')) {
            message += '  - 改进了提示信息\n';
        }
    }
    if (allChanges.performance) {
        message += '- 性能优化：\n';
        if (allDiffs.includes('async')) {
            message += '  - 改进了异步处理\n';
        }
        if (allDiffs.includes('cache')) {
            message += '  - 添加了缓存机制\n';
        }
    }
    message += '\n';

    // 添加改进好处
    message += '改进好处：\n';
    if (allChanges.encryption) {
        message += '- 加密功能更稳定\n';
        message += '- 密码管理更安全\n';
    }
    if (allChanges.fileHandling) {
        message += '- 文件操作更智能\n';
        message += '- 自动加密更可靠\n';
    }
    if (allChanges.attachment) {
        message += '- 附件处理更完善\n';
        message += '- 链接管理更准确\n';
    }
    if (allChanges.security) {
        message += '- 文件保护更安全\n';
        message += '- 隐私保护更可靠\n';
    }
    if (allChanges.ui) {
        message += '- 操作体验更流畅\n';
        message += '- 提示信息更清晰\n';
    }
    if (allChanges.performance) {
        message += '- 运行速度更快\n';
        message += '- 资源利用更合理\n';
    }

    return message;
}

// 主函数
function main() {
    try {
        const changes = getChanges();
        if (changes.length === 0) {
            console.log('没有需要提交的改动');
            return;
        }

        // 获取最近的commit信息
        const lastCommitMessage = execSync('git log -1 --pretty=%B').toString().trim();
        
        // 如果commit信息已经包含问题描述和修改思路，则不再生成新的commit信息
        if (lastCommitMessage.includes('问题：') && lastCommitMessage.includes('修改思路：')) {
            console.log('使用已有的commit信息');
            return;
        }

        // 如果环境变量中设置了commit信息，则使用它
        if (process.env.COMMIT_MESSAGE) {
            console.log('使用环境变量中的commit信息');
            execSync('git add .');
            execSync(`git commit -m "${process.env.COMMIT_MESSAGE}"`);
            console.log('成功提交改动');
            return;
        }

        // 如果没有设置commit信息，则提示用户
        console.log('请手动设置commit信息');
    } catch (error) {
        console.error('Error in post-build script:', error);
    }
}

main(); 