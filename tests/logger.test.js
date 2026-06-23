/**
 * Logger 測試
 */
const logger = require('../utils/logger');

describe('Logger - sanitize', () => {
    test('should sanitize token field', () => {
        const input = {
            userId: 'U123',
            token: 'secret_token_123',
            data: 'normal data'
        };

        const sanitized = logger.sanitize(input);
        expect(sanitized.userId).toBe('U123');
        expect(sanitized.token).toBe('***REDACTED***');
        expect(sanitized.data).toBe('normal data');
    });

    test('should sanitize password field', () => {
        const input = {
            username: 'user',
            password: 'my_password'
        };

        const sanitized = logger.sanitize(input);
        expect(sanitized.username).toBe('user');
        expect(sanitized.password).toBe('***REDACTED***');
    });

    test('should sanitize apiKey field', () => {
        const input = {
            apiKey: 'api_key_123',
            value: '100'
        };

        const sanitized = logger.sanitize(input);
        expect(sanitized.apiKey).toBe('***REDACTED***');
        expect(sanitized.value).toBe('100');
    });

    test('should sanitize secret field', () => {
        const input = {
            secret: 'my_secret',
            public: 'public_data'
        };

        const sanitized = logger.sanitize(input);
        expect(sanitized.secret).toBe('***REDACTED***');
        expect(sanitized.public).toBe('public_data');
    });

    test('should sanitize authorization field', () => {
        const input = {
            authorization: 'Bearer token123',
            userId: 'U123'
        };

        const sanitized = logger.sanitize(input);
        expect(sanitized.authorization).toBe('***REDACTED***');
        expect(sanitized.userId).toBe('U123');
    });

    test('should handle non-object inputs', () => {
        expect(logger.sanitize('string')).toBe('string');
        expect(logger.sanitize(123)).toBe(123);
        expect(logger.sanitize(null)).toBe(null);
        expect(logger.sanitize(undefined)).toBe(undefined);
    });

    test('should not mutate original object', () => {
        const input = {
            token: 'secret',
            data: 'value'
        };

        const sanitized = logger.sanitize(input);

        // 原始對象不應該被修改
        expect(input.token).toBe('secret');
        expect(sanitized.token).toBe('***REDACTED***');
    });
});

describe('Logger - methods', () => {
    // 由於 logger 會輸出到 console，我們需要 mock console
    let stdoutSpy;
    let stderrSpy;

    beforeEach(() => {
        stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();
        stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    test('should call process.stdout.write for info level', () => {
        logger.info('test message', { key: 'value' });
        expect(stdoutSpy).toHaveBeenCalled();
    });

    test('should call process.stderr.write for error level', () => {
        const error = new Error('test error');
        logger.error('error occurred', error);
        expect(stderrSpy).toHaveBeenCalled();
    });

    test('should call process.stderr.write for warn level', () => {
        logger.warn('warning message');
        expect(stderrSpy).toHaveBeenCalled();
    });
});
