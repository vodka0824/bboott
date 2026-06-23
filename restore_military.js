const { connectDB, db } = require('./utils/db');

async function restoreMilitaryCount() {
    await connectDB();
    
    const targetUsers = [
        "U9f112e62754b283d2a95f6a49898dc4f",
        "Uae5a104ba391a4a306dd738cc6487ad1",
        "Udea89403f35a6ddea8d85eb2a4efcb8e",
        "U175ea957c81f2e3ff4fa67a568f6028f",
        "U181a8a4761f6fcb05923676433a0573a"
    ];
    
    // Default compensation values
    const restoreCount = 10; // 預設恢復為 10 次 (上尉)
    
    for (const userId of targetUsers) {
        await db.collection('economy_users').doc(userId).update({
            militaryEnlistCount: restoreCount
        });
        console.log(`Restored user ${userId} militaryEnlistCount to ${restoreCount}`);
    }
    
    console.log('Restore complete.');
    process.exit(0);
}

restoreMilitaryCount().catch(console.error);
