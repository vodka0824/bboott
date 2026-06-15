
// Set Envs to pass validiation in constants (if any)
process.env.LINE_TOKEN = 'dummy_token';
process.env.ADMIN_USER_ID = 'dummy_admin';
process.env.GOOGLE_CLOUD_PROJECT = 'dummy_project';
process.env.CHANNEL_ACCESS_TOKEN = 'dummy_token'; // Used in line.js

// Mock Dependencies
jest.mock('../utils/db', () => ({
    db: {
        collection: jest.fn(() => ({
            doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ exists: false }),
                set: jest.fn().mockResolvedValue({}),
                update: jest.fn().mockResolvedValue({})
            }))
        }))
    },
    Firestore: {
        FieldValue: {
            arrayUnion: jest.fn()
        }
    }
}));

const todoHandler = require('../handlers/todo');

describe('Generate Flex JSON', () => {
    test('generate and validate flex message', () => {
        const mockTodos = [
            { text: 'Task 1', done: false, priority: 'high', category: 'new', createdAt: 10001 },
            { text: 'Task 2', done: true, priority: 'low', category: 'repair', createdAt: 10002 }
        ];

        const bubble = todoHandler.buildTodoFlex('G123', mockTodos);

        console.log('--- FLEX JSON START ---');
        console.log(JSON.stringify(bubble, null, 2));
        console.log('--- FLEX JSON END ---');

        // Validation: Log only
        const validate = (node, path = '') => {
            if (node.type === 'text') {
                if (node.backgroundColor) console.log(`[WARN] Invalid backgroundColor at ${path}`);
                if (node.cornerRadius) console.log(`[WARN] Invalid cornerRadius at ${path}`);
            }
            if (node.contents && Array.isArray(node.contents)) {
                node.contents.forEach((c, i) => validate(c, `${path}.contents[${i}]`));
            }
        };

        validate(bubble, 'root');
    });
});

