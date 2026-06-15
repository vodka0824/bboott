function getHandValue(cards) {
    // simplified eval
    // returns a score
}
// Actually, it's easier to just simulate 1,000,000 hands.
const SUITS = [0,1,2,3];
const VALUES = [2,3,4,5,6,7,8,9,10,11,12,13,14];

function getDeck() {
    let deck = [];
    for(let s of SUITS) for(let v of VALUES) deck.push({s, v});
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function evalHand(hand) {
    hand.sort((a,b) => b.v - a.v);
    let isFlush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
    let isStraight = (hand[0].v === hand[1].v + 1 && hand[1].v === hand[2].v + 1) || 
                     (hand[0].v === 14 && hand[1].v === 3 && hand[2].v === 2); // A32 is straight in Chinese ZJH
    let isThree = hand[0].v === hand[1].v && hand[1].v === hand[2].v;
    let isPair = hand[0].v === hand[1].v || hand[1].v === hand[2].v;
    
    let type = 0; // High card
    if (isPair) type = 1;
    if (isStraight) type = 2; // In ZJH, Flush > Straight
    if (isFlush) type = 3;
    if (isStraight && isFlush) type = 4;
    if (isThree) type = 5; // Three of a kind > Straight Flush in some, but we use ZJH standard: 豹子 > 同花順 > 金花 > 順子

    // score for comparison
    // A32 is the smallest straight
    let v1 = hand[0].v, v2 = hand[1].v, v3 = hand[2].v;
    if (isStraight && v1 === 14 && v2 === 3 && v3 === 2) {
        v1 = 3; v2 = 2; v3 = 1;
    }
    
    let score = (type * 1000000) + (v1 * 10000) + (v2 * 100) + v3;
    
    // In ZJH, pair score needs to put pair value first
    if (type === 1) {
        let pairV = hand[0].v === hand[1].v ? hand[0].v : hand[1].v;
        let kicker = hand[0].v === hand[1].v ? hand[2].v : hand[0].v;
        score = (type * 1000000) + (pairV * 10000) + (pairV * 100) + kicker;
    }

    return { type, score };
}

let winCount = 0;
let lossCount = 0;
let payouts = [1, 1, 2, 3, 4, 5]; // HighCard, Pair, Straight, Flush, StrFlush, Three
let totalPayout = 0;

for(let i=0; i<1000000; i++) {
    let deck = getDeck();
    shuffle(deck);
    let pHand = [deck[0], deck[1], deck[2]];
    let dHand = [deck[3], deck[4], deck[5]];
    
    let p = evalHand(pHand);
    let d = evalHand(dHand);
    
    if (p.score > d.score) {
        winCount++;
        totalPayout += payouts[p.type];
    } else if (d.score > p.score) {
        lossCount++;
    }
}

console.log(`Win: ${winCount/10000}%`);
console.log(`Expected Payout per win: ${totalPayout / winCount}`);
console.log(`Overall EV for player: ${(totalPayout - lossCount)/1000000}`);
