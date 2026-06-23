const auth = require('./utils/auth');

// Mock memoryCache
auth.featureToggleCache = new Map();

const mockFeatures = {
    life: { enabled: false },
    entertainment: { enabled: false },
    economy: { enabled: true },
    gambling: { enabled: true, casino: true, multiplayer: true }
};

auth.featureToggleCache.set('G123', mockFeatures);

console.log('multiplayer:', auth.isFeatureEnabled('G123', 'multiplayer'));
console.log('gambling.multiplayer:', auth.isFeatureEnabled('G123', 'gambling.multiplayer'));
console.log('casino:', auth.isFeatureEnabled('G123', 'casino'));
