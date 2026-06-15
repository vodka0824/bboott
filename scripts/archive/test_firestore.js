const { db } = require('./utils/db');
try {
    const doc = db.collection('economy_users').doc(undefined);
    console.log('Success:', doc.id);
} catch (e) {
    console.error('Error:', e.message);
}
