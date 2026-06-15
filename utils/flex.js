/**
 * LINE Flex Message Utility Functions
 * Standardizes the construction of Flex Bubbles, Boxes, and Text components.
 */

function createBubble({ size, header, hero, body, footer, styles }) {
    return { type: 'bubble', size, header, hero, body, footer, styles };
}

function createHeader(title, subtitle = '', color = '#000000', textColor = '#FFFFFF') {
    const contents = [{ type: 'text', text: title, weight: 'bold', color: textColor, size: 'md' }];
    if (subtitle) contents.push({ type: 'text', text: subtitle, color: '#DDDDDD', size: 'xxs' });
    return { type: 'box', layout: 'vertical', contents, backgroundColor: color, paddingAll: '12px' };
}

function createText({ text, size = 'sm', color = '#666666', weight = 'regular', align, margin, flex, gravity, wrap, adjustMode, action, decoration, position, offsetTop, offsetBottom, offsetStart, offsetEnd, contents }) {
    const obj = { type: 'text', size, color, weight, align, margin, flex, gravity, wrap, adjustMode, action, decoration, position, offsetTop, offsetBottom, offsetStart, offsetEnd };
    if (contents) obj.contents = contents;
    else obj.text = text;
    return obj;
}

function createImage({ url, size = 'md', aspectRatio = '1:1', aspectMode = 'cover', backgroundColor, action, position, offsetTop, offsetBottom, offsetStart, offsetEnd, flex, margin, animated }) {
    return { type: 'image', url, size, aspectRatio, aspectMode, backgroundColor, action, position, offsetTop, offsetBottom, offsetStart, offsetEnd, flex, margin, animated };
}

function createSeparator(margin = 'md', color) {
    return { type: 'separator', margin, color };
}

function createBox(layout, contents, options = {}) {
    return { type: 'box', layout, contents, ...options };
}

function createCarousel(bubbles) {
    return { type: 'carousel', contents: bubbles };
}

function createFlexMessage(altText, contents) {
    return { type: 'flex', altText, contents };
}

function createButton({ action, style = 'link', color, height = 'sm', flex, margin, position, offsetTop, offsetBottom, offsetStart, offsetEnd }) {
    return { type: 'button', action, style, color, height, flex, margin, position, offsetTop, offsetBottom, offsetStart, offsetEnd };
}

const COLORS = {
    PRIMARY: '#1E90FF',
    SUCCESS: '#00B900',
    DANGER: '#FF334B',
    WARNING: '#FFCC00',
    GRAY: '#AAAAAA',
    DARK_GRAY: '#555555',
    LIGHT_GRAY: '#F5F5F5',
    WIN: '#4CAF50',
    LOSE: '#F44336'
};

function getBetQuickReply() {
    return {
        items: [
            { type: 'action', action: { type: 'message', label: '+100萬', text: '+100w' } },
            { type: 'action', action: { type: 'message', label: '+1000萬', text: '+1000w' } },
            { type: 'action', action: { type: 'message', label: '+1個億', text: '+1億' } },
            { type: 'action', action: { type: 'message', label: '歐印', text: '歐印' } }
        ]
    };
}

/**
 * 建立標籤 Badge
 */
function createBadge(text, bgColor = '#333333', textColor = '#FFFFFF') {
    return {
        type: 'box',
        layout: 'vertical',
        flex: 0,
        backgroundColor: bgColor,
        cornerRadius: 'md',
        paddingStart: '6px',
        paddingEnd: '6px',
        paddingTop: '2px',
        paddingBottom: '2px',
        contents: [
            { type: 'text', text: text, size: 'xxs', color: textColor, weight: 'bold', align: 'center' }
        ]
    };
}

/**
 * 建立進度條 Progress Bar
 */
function createProgressBar(percentage, filledColor = '#00B900', emptyColor = '#333333') {
    let flexFilled = Math.max(1, Math.min(100, Math.round(percentage * 100)));
    let flexEmpty = 100 - flexFilled;
    
    const contents = [
        { type: 'box', layout: 'vertical', backgroundColor: filledColor, flex: flexFilled, contents: [{ type: 'filler' }] }
    ];
    if (flexEmpty > 0) {
        contents.push({ type: 'box', layout: 'vertical', backgroundColor: emptyColor, flex: flexEmpty, contents: [{ type: 'filler' }] });
    }

    return {
        type: 'box',
        layout: 'horizontal',
        height: '6px',
        cornerRadius: 'sm',
        margin: 'sm',
        contents: contents
    };
}

module.exports = {
    createBubble,
    createHeader,
    createText,
    createImage,
    createSeparator,
    createBox,
    createCarousel,
    createFlexMessage,
    createButton,
    createBadge,
    createProgressBar,
    COLORS,
    getBetQuickReply
};
