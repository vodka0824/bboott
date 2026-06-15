/**
 * 日誌工具模組
 * 統一管理日誌輸出，支援分級和環境控制
 */

const util = require('util');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// 日誌級別優先順序
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

class Logger {
    constructor() {
        this.currentLevel = LEVELS[LOG_LEVEL] || LEVELS.info;
    }

    /**
     * Debug 級別日誌（開發用）
     */
    debug(...args) {
        if (this.currentLevel <= LEVELS.debug) {
            process.stdout.write(`[DEBUG] ${util.format(...args)}\n`);
        }
    }

    /**
     * Info 級別日誌（一般資訊）
     */
    info(...args) {
        if (this.currentLevel <= LEVELS.info) {
            process.stdout.write(`[INFO] ${util.format(...args)}\n`);
        }
    }

    /**
     * Warning 級別日誌（警告）
     */
    warn(...args) {
        if (this.currentLevel <= LEVELS.warn) {
            process.stderr.write(`[WARN] ${util.format(...args)}\n`);
        }
    }

    /**
     * Error 級別日誌（錯誤）
     */
    error(...args) {
        if (this.currentLevel <= LEVELS.error) {
            if (args.length === 2 && args[1] instanceof Error) {
                const message = args[0];
                const error = args[1];
                const meta = {
                    message: error.message,
                    stack: error.stack,
                    ...(error.response?.data && { apiError: error.response.data })
                };
                process.stderr.write(`[ERROR] ${message} ${util.inspect(meta)}\n`);
            } else if (args.length === 2 && typeof args[1] === 'object') {
                const message = args[0];
                const error = args[1];
                const meta = { rawError: JSON.stringify(error) };
                process.stderr.write(`[ERROR] ${message} ${util.inspect(meta)}\n`);
            } else {
                process.stderr.write(`[ERROR] ${util.format(...args)}\n`);
            }
        }
    }

    /**
     * 清理敏感資訊的日誌輸出
     */
    sanitize(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const sanitized = { ...obj };
        const sensitiveKeys = ['token', 'password', 'apikey', 'secret', 'authorization'];

        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                sanitized[key] = '***REDACTED***';
            }
        }

        return sanitized;
    }
}

module.exports = new Logger();
