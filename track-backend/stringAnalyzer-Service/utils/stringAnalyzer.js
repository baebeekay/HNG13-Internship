const crypto = require('crypto');

const analyzeString = (value) => {
    // 1. SHA-256 Hash
    const sha256_hash = crypto.createHash('sha256').update(value, 'utf8').digest('hex');

    // 2. Palindrome Check (robust: case/whitespace/punctuation-insensitive)
    const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const is_palindrome = normalized === normalized.split('').reverse().join('');

    // 3. Character Frequency Map & Unique Characters
    const char_freq_map = {};
    for (const char of value) {
        char_freq_map[char] = (char_freq_map[char] || 0) + 1;
    }
    const unique_characters = Object.keys(char_freq_map).length;

    // 4. Word Count (robust: split by one or more whitespace, handles leading/trailing)
    const word_count = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;

    const properties = {
        length: value.length,
        is_palindrome,
        unique_characters,
        word_count,
        sha256_hash,
        character_frequency_map: char_freq_map,
    };

    return {
        id: sha256_hash,
        value,
        properties,
        created_at: new Date().toISOString()
    };
};

module.exports = {
    analyzeString,
};
