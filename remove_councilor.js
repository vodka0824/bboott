const { db } = require('./utils/db');

async function removeCouncilor() {
    const userId = 'Ucf8e01b60972571bd9b5d09a65030c8b';
    const docRef = db.collection('economy_users').doc(userId);
    
    await docRef.update({
        councilorUntil: db.FieldValue.delete()
    });
    
    console.log('Removed councilor status for', userId);
    process.exit(0);
}

removeCouncilor().catch(console.error);
