/**
 * 多人 21 點核心邏輯測試
 */
process.env.CHANNEL_ACCESS_TOKEN = 'mock_token';
process.env.ADMIN_USER_ID = 'mock_admin';

const { _test } = require('../handlers/multi_blackjack');

describe('Multi Blackjack Pure Functions', () => {
    describe('createDeck', () => {
        test('should create a deck with 208 cards (4 decks)', () => {
            const deck = _test.createDeck();
            expect(deck.length).toBe(208); // 52 * 4
        });

        test('should contain valid suits and values', () => {
            const deck = _test.createDeck();
            const card = deck[0];
            expect(['♠️', '♥️', '♦️', '♣️']).toContain(card.suit);
            expect(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']).toContain(card.value);
        });
    });

    describe('calculateScore', () => {
        test('should calculate number cards correctly', () => {
            const hand = [
                { value: '2' },
                { value: '7' }
            ];
            expect(_test.calculateScore(hand)).toBe(9);
        });

        test('should calculate face cards correctly', () => {
            const hand = [
                { value: 'J' },
                { value: 'Q' },
                { value: 'K' }
            ];
            expect(_test.calculateScore(hand)).toBe(30);
        });

        test('should handle single Ace correctly', () => {
            const hand = [
                { value: 'A' },
                { value: '5' }
            ];
            expect(_test.calculateScore(hand)).toBe(16);
        });

        test('should handle Blackjack (A + 10-value card)', () => {
            const hand1 = [{ value: 'A' }, { value: '10' }];
            const hand2 = [{ value: 'A' }, { value: 'K' }];
            expect(_test.calculateScore(hand1)).toBe(21);
            expect(_test.calculateScore(hand2)).toBe(21);
        });

        test('should handle multiple Aces without busting if possible', () => {
            const hand = [
                { value: 'A' },
                { value: 'A' },
                { value: '9' }
            ];
            // A (11) + A (1) + 9 = 21
            expect(_test.calculateScore(hand)).toBe(21);
        });

        test('should downgrade Ace to 1 if score > 21', () => {
            const hand = [
                { value: 'A' },
                { value: '5' },
                { value: '8' } // 11 + 5 + 8 = 24 -> Ace becomes 1 -> 1 + 5 + 8 = 14
            ];
            expect(_test.calculateScore(hand)).toBe(14);
        });

        test('should handle multiple Aces downgrade', () => {
            const hand = [
                { value: 'A' },
                { value: 'A' },
                { value: 'A' },
                { value: '10' }
            ];
            // A(1) + A(1) + A(1) + 10 = 13
            expect(_test.calculateScore(hand)).toBe(13);
        });
    });

    describe('renderHand', () => {
        test('should render hand completely', () => {
            const hand = [
                { suit: '♠️', value: 'A' },
                { suit: '♥️', value: 'K' }
            ];
            expect(_test.renderHand(hand)).toBe('♠️A ♥️K');
        });

        test('should hide first card if requested', () => {
            const hand = [
                { suit: '♠️', value: 'A' },
                { suit: '♥️', value: 'K' }
            ];
            expect(_test.renderHand(hand, true)).toBe('🎴 ♥️K');
        });

        test('should handle empty hand', () => {
            expect(_test.renderHand([])).toBe('無');
        });
    });
});
