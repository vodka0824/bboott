const path = require('path');
const { db } = require('./utils/db');

async function fixMilitaryJobs() {
    console.log('Starting to fix users with jobs who are in the military...');
    const now = Date.now();
    const collectionRef = db.collection('economy_users');
    const snapshot = await collectionRef.get();
    
    let count = 0;
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const isMilitary = data.militaryUntil && data.militaryUntil > now;
        
        if (isMilitary) {
            const isCouncilor = data.councilorUntil && data.councilorUntil > now;
            const isPolice = data.isPolice === true;
            const isMafia = data.isMafia === true;
            
            if (isCouncilor || isPolice || isMafia) {
                console.log(`User ${doc.id} is in military but also has a job (Councilor: ${!!isCouncilor}, Police: ${!!isPolice}, Mafia: ${!!isMafia}). Removing from military camp.`);
                batch.update(doc.ref, {
                    militaryUntil: 0
                });
                count++;
            }
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`Successfully fixed ${count} users.`);
    } else {
        console.log('No users found that need fixing.');
    }
    
    process.exit(0);
}

fixMilitaryJobs().catch(console.error);
