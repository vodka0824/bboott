// Set Mock Envs before any imports
process.env.LINE_TOKEN = 'dummy_token';
process.env.ADMIN_USER_ID = 'dummy_admin';
process.env.GOOGLE_CLOUD_PROJECT = 'dummy_project';
process.env.CHANNEL_ACCESS_TOKEN = 'dummy_token';

const lineUtils = require('../utils/line');
const logger = require('../utils/logger');

// Explicitly mock logger
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
}));

// Mock dependencies
jest.mock('../utils/line');

// Intercept DB
jest.mock('../utils/db', () => {
    const mockGet = jest.fn();
    const mockSet = jest.fn();
    const mockDocFn = jest.fn(() => ({
        get: mockGet,
        set: mockSet
    }));
    const mockCollectionFn = jest.fn(() => ({
        doc: mockDocFn
    }));

    return {
        db: {
            collection: mockCollectionFn
        },
        Firestore: {
            FieldValue: {
                serverTimestamp: jest.fn()
            }
        },
        _mockGet: mockGet,
        _mockSet: mockSet
    };
});

const { _mockGet: mockGet, _mockSet: mockSet } = require('../utils/db');

// Import handler AFTER mocking
const welcomeHandler = require('../handlers/welcome');

describe('Welcome Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock returns
        lineUtils.getGroupMemberProfile.mockResolvedValue({
            displayName: 'Test User',
            pictureUrl: 'http://example.com/pic.jpg'
        });

        // Default: No config exists
        mockGet.mockResolvedValue({
            exists: false,
            data: jest.fn()
        });
    });

    test('should send default welcome message when no config exists', async () => {
        const event = {
            replyToken: 'test-reply-token',
            source: { groupId: 'C12345', type: 'group' },
            joined: {
                members: [{ userId: 'U12345' }]
            }
        };

        await welcomeHandler.handleMemberJoined(event);

        expect(lineUtils.getGroupMemberProfile).toHaveBeenCalledWith('C12345', 'U12345');
        expect(lineUtils.replyFlex).toHaveBeenCalled();
        const callArgs = lineUtils.replyFlex.mock.calls[0];
        expect(callArgs[0]).toBe('test-reply-token');
        expect(callArgs[1]).toBe('歡迎新成員！');
    });

    test('should respect disabled config', async () => {
        // Mock Config Exists but Disabled
        mockGet.mockResolvedValue({
            exists: true,
            data: () => ({ welcomeConfig: { enabled: false } })
        });

        const event = {
            replyToken: 'token',
            source: { groupId: 'C12345' },
            joined: { members: [{ userId: 'U1' }] }
        };

        await welcomeHandler.handleMemberJoined(event);

        expect(lineUtils.replyFlex).not.toHaveBeenCalled();
    });

    test('should use configured text and image', async () => {
        mockGet.mockResolvedValue({
            exists: true,
            data: () => ({
                welcomeConfig: {
                    enabled: true,
                    text: 'Hello {user}!',
                    imageUrl: 'https://custom.img/1.jpg'
                }
            })
        });

        const event = {
            replyToken: 'token',
            source: { groupId: 'C12345' },
            joined: { members: [{ userId: 'U1' }] }
        };

        await welcomeHandler.handleMemberJoined(event);

        expect(lineUtils.replyFlex).toHaveBeenCalled();
        const bubble = lineUtils.replyFlex.mock.calls[0][2];
        const bodyText = bubble.body.contents[0].contents[1].contents[1].text;
        expect(bodyText).toBe('Hello Test User!');
        expect(bubble.hero.url).toContain('https://custom.img/1.jpg');
    });

    test('should handle missing source gracefully', async () => {
        const event = {
            replyToken: 'token',
            // source missing
            joined: { members: [{ userId: 'U1' }] }
        };

        await welcomeHandler.handleMemberJoined(event);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Event missing source'),
            expect.anything()
        );
        expect(lineUtils.replyFlex).not.toHaveBeenCalled();
    });
});
