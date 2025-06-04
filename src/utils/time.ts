export class TimeManager {
    private timeout: number;
    private timers: Map<string, NodeJS.Timeout> = new Map();

    constructor(timeout: number) {
        this.timeout = timeout * 1000; // 将秒转换为毫秒
    }

    /**
     * 设置文件自动加密定时器
     * @param filePath 文件路径
     * @param callback 回调函数
     */
    setTimer(filePath: string, callback: () => void): void {
        // 清除已存在的定时器
        this.clearTimer(filePath);

        // 设置新的定时器
        const timer = setTimeout(() => {
            callback();
            this.timers.delete(filePath);
        }, this.timeout);

        this.timers.set(filePath, timer);
    }

    /**
     * 清除文件自动加密定时器
     * @param filePath 文件路径
     */
    clearTimer(filePath: string): void {
        const timer = this.timers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(filePath);
        }
    }

    /**
     * 清除所有定时器
     */
    clearAllTimers(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    /**
     * 调度一个任务
     * @param callback 回调函数
     */
    schedule(callback: () => void): void {
        const timer = setTimeout(() => {
            callback();
        }, this.timeout);

        this.timers.set('schedule', timer);
    }
} 