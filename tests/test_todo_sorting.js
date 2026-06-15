const todoHandler = require('../handlers/todo.js');
const { db } = require('../utils/db');

// Mock Firestore
// We need to mock the entire structure to test logic without real DB if possible,
// but since `db` is required from `firestore.js`, we might rely on the real emulator or mock.
// Given strict instructions, let's try to mock the specific calls `todoHandler` makes.
// Or actually, since we are in dev environment, maybe we can just run it?
// But we don't know if firestore emulator is running.
// Let's create a "Unit Test" by overwriting `db` methods on the handler or mocking the module.
// Since `todoHandler` imports `db` directly, we can't easily mock it unless we use proxyquire or similar.
// BUT, we can just replace `todoHandler.db` if it was exported? It's not.
// Modification: I will read the file content of `handlers/todo.js` and "inject" my own mock DB by creating a modified version of the handler in a temp file.

const fs = require('fs');
const path = require('path');

const handlerPath = path.join(__dirname, '../handlers/todo.js');
let handlerCode = fs.readFileSync(handlerPath, 'utf8');

// Inject Mock DB
const mockDbCode = `
const mockData = {
    'items': [
        { text: 'Task A (Low)', priority: 'low', priorityOrder: 3 },
        { text: 'Task B (High)', priority: 'high', priorityOrder: 1 },
        { text: 'Task C (Medium)', priority: 'medium', priorityOrder: 2 }
    ]
};

const db = {
    collection: () => ({
        doc: () => ({
            get: async () => ({
                exists: true,
                data: () => mockData
            }),
            update: async (data) => {
                if (data.items) mockData.items = data.items;
                console.log('[MockDB] Updated Items:', JSON.stringify(mockData.items.map(i => i.text)));
            },
            set: async () => {}
        })
    })
};
const Firestore = { FieldValue: { arrayUnion: (item) => item } };
`;

// Replace require
handlerCode = handlerCode.replace("const { db, Firestore } = require('../utils/db');", mockDbCode);

// Fix module.exports to only export what we need or just eval it
// Let's write to `tests/temp_todo_handler.js`
const tempPath = path.join(__dirname, 'temp_todo_handler.js');
fs.writeFileSync(tempPath, handlerCode);

const mockHandler = require('./temp_todo_handler.js');

async function test() {
    console.log('--- Initial State (DB Order) ---');
    console.log('1. Task A (Low)');
    console.log('2. Task B (High)');
    console.log('3. Task C (Medium)');

    console.log('\n--- Display Order (Expected) ---');
    const list = await mockHandler.getTodoList('group1');
    list.forEach((item, i) => console.log(`${i + 1}. ${item.text} (${item.priority})`));
    // Expected:
    // 1. Task B (High)
    // 2. Task C (Medium)
    // 3. Task A (Low)

    console.log('\n--- Action: Delete 2 (Task C) ---');
    // Verify before
    if (list[1].text !== 'Task C (Medium)') throw new Error('Sort failed');

    // Action
    const res = await mockHandler.deleteTodo('group1', 1); // Index 1 is the second item
    console.log(`Result: ${res.success}, Text: ${res.text}`);

    if (res.text !== 'Task C (Medium)') {
        console.error('❌ FAILED: Deleted wrong item!');
        console.error('Expected: Task C (Medium)');
        console.error(`Actual: ${res.text}`);
    } else {
        console.log('✅ SUCCESS: Deleted correct item based on display order.');
    }

    console.log('\n--- Final DB State ---');
    // We expect Task A and Task B to remain.
    // Task C was index 2 in DB initially.
    // Task A was index 0.
    // Task B was index 1.
    // So if Task C is deleted, we have A and B.
}

test().catch(console.error).finally(() => {
    // Cleanup
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
});
