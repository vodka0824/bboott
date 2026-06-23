/**
 * 指令路由模組
 */
const authUtils = require('./auth');
const { handleError } = require('./errorHandler');

const routeMiddlewares = require('../middlewares/routeChecks');

class CommandRouter {
    constructor() {
        this.routes = [];
    }

    /**
     * 註冊指令
     * @param {string|RegExp|Function} pattern 匹配模式
     * @param {Function} handler 處理函式 (context, match) => Promise<void>
     * @param {Object} options 選項
     * @param {boolean} options.isGroupOnly 僅限群組
     * @param {boolean} options.needAuth 需要群組已註冊
     * @param {boolean} options.adminOnly 僅限超級管理員
     * @param {string} options.feature 需要開啟的功能 (例如 'weather', 'ai')
     */
    register(pattern, handler, options = {}) {
        this.routes.push({ pattern, handler, options });
    }

    /**
     * 執行指令
     * @param {string} message 訊息內容
     * @param {Object} context 上下文 (replyToken, userId, groupId, etc.)
     * @returns {Promise<boolean>} 是否已處理
     */
    async execute(message, context) {
        const { isGroup, isAuthorizedGroup, isSuper, groupId } = context;

        for (const route of this.routes) {
            // 0. Keyword Fast-Path 檢查
            if (route.options.keywords && route.options.keywords.length > 0) {
                // 若 message 不包含任何一個 keyword，則直接跳過此路由
                const hasKeyword = route.options.keywords.some(k => message.includes(k));
                if (!hasKeyword) continue;
            }

            // 1. 匹配檢查
            let match = null;
            if (typeof route.pattern === 'string') {
                if (message === route.pattern) match = [message];
            } else if (route.pattern instanceof RegExp) {
                match = message.match(route.pattern);
            } else if (typeof route.pattern === 'function') {
                if (route.pattern(message)) match = [message];
            }

            if (!match) continue;
            console.log(`[Router] Match found for "${message}": ${route.pattern}`);

            // Middleware Pipeline
            const pipeline = [
                routeMiddlewares.checkDMMW,
                routeMiddlewares.checkBasicAuthMW,
                routeMiddlewares.checkFeatureToggleMW,
                routeMiddlewares.checkCasinoMW,
                routeMiddlewares.checkStatusBlockMW,
                routeMiddlewares.checkJailMW,
                routeMiddlewares.checkAdminMW
            ];

            let isBlocked = false;
            for (const mw of pipeline) {
                if (await mw(context, message, route)) {
                    isBlocked = true;
                    break;
                }
            }
            if (isBlocked) continue;

            // Optional Route-specific Middlewares
            if (route.options.middlewares && Array.isArray(route.options.middlewares)) {
                let customBlocked = false;
                for (const mw of route.options.middlewares) {
                    if (await mw(context, message, route)) {
                        customBlocked = true;
                        break;
                    }
                }
                if (customBlocked) continue;
            }

            // 5. 執行處理
            try {
                const result = await route.handler(context, match);
                console.log(`[ROUTER DEBUG] Route ${route.pattern} returned result: ${result}`);
                if (result === false) continue;
                console.log(`[ROUTER DEBUG] Match returned true (or undefined), stopping here.`);
                return true;
            } catch (error) {
                console.log(`[ROUTER DEBUG] Route ${route.pattern} threw error: ${error.message}`);
                await handleError(error, context);
                return true; // 視為已處理 (錯誤已捕捉)
            }
        }

        console.log(`[ROUTER DEBUG] All matched routes returned false. router.execute returns false.`);
        return false;
    }
    /**
     * 註冊 Postback 處理
     * @param {string|Function} predicate 判斷字串或函式 (data) => boolean
     * @param {Function} handler 處理函式 (context) => Promise<void>
     */
    registerPostback(predicate, handler) {
        if (!this.postbackRoutes) this.postbackRoutes = [];
        
        let finalPredicate = predicate;
        if (typeof predicate === 'string') {
            finalPredicate = (data) => {
                try {
                    const params = new URLSearchParams(data);
                    return params.get('action') === predicate;
                } catch (e) {
                    return false;
                }
            };
        }
        
        this.postbackRoutes.push({ predicate: finalPredicate, handler });
    }

    /**
     * 執行 Postback
     * @param {string} data Postback data
     * @param {Object} context 上下文
     * @returns {Promise<boolean>} 是否已處理
     */
    async executePostback(data, context) {
        if (!this.postbackRoutes) return false;
        
        context.isButton = true;

        for (const route of this.postbackRoutes) {
            if (route.predicate(data)) {
                try {
                    await route.handler(context);
                    return true;
                } catch (error) {
                    await handleError(error, context);
                    return true;
                }
            }
        }
        return false;
    }
}

module.exports = new CommandRouter();
