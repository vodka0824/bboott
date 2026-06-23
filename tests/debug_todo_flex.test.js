
process.env.CHANNEL_ACCESS_TOKEN = 'dummy_token';
process.env.ADMIN_USER_ID = 'dummy_admin';

const todoHandler = require('../handlers/todo');

// Mock dependencies
jest.mock('../utils/db', () => ({
    db: {
        collection: jest.fn()
    },
    Firestore: {
        FieldValue: {
            arrayUnion: jest.fn()
        }
    }
}));

describe('Debug Todo Flex', () => {
    test('generate flex message json', () => {
        const mockTodos = [
            { text: 'Task 1', done: false, priority: 'high', category: 'new', createdAt: 10001 },
            { text: 'Task 2', done: true, priority: 'low', category: 'repair', createdAt: 10002 }
        ];

        const bubble = todoHandler.buildTodoFlex('G123', mockTodos);

        console.log('--- FLEX JSON START ---');
        console.log(JSON.stringify(bubble, null, 2));
        console.log('--- FLEX JSON END ---');

        expect(bubble).toBeDefined();
        expect(bubble.type).toBe('carousel');
        expect(bubble.contents).toBeDefined();

        // Deep inspection for valid properties only
        const traverse = (node) => {
            if (node.type === 'text') {
                if (node.backgroundColor || node.cornerRadius) {
                    throw new Error(`Invalid property on Text node: ${JSON.stringify(node)}`);
                }
            }
            if (node.contents) {
                node.contents.forEach(traverse);
            }
        };
        traverse(bubble);
    });
});

