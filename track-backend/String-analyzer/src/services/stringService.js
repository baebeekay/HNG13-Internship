const CryptoJS = require('crypto-js');

class StringService {
  static analyzeString(value) {
    if (typeof value !== 'string') {
      throw new Error('Value must be a string');
    }

    const length = value.length;
    const is_palindrome = value.toLowerCase() === value.toLowerCase().split('').reverse().join('');
    const unique_characters = new Set(value).size;
    const word_count = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
    const sha256_hash = CryptoJS.SHA256(value).toString();
    const character_frequency_map = {};
    for (const char of value) {
      character_frequency_map[char] = (character_frequency_map[char] || 0) + 1;
    }

    return {
      length,
      is_palindrome,
      unique_characters,
      word_count,
      sha256_hash,
      character_frequency_map,
    };
  }

  static parseNaturalLanguage(query) {
    const lowerQuery = query.toLowerCase();
    const filters = {};

    if (lowerQuery.includes('single word')) {
      filters.word_count = 1;
    }
    if (lowerQuery.includes('palindromic')) {
      filters.is_palindrome = true;
    }
    if (lowerQuery.includes('longer than')) {
      const match = lowerQuery.match(/longer than (\d+)/);
      if (match) filters.min_length = parseInt(match[1]) + 1;
    }
    if (lowerQuery.includes('letter')) {
      const match = lowerQuery.match(/letter (\w)/);
      if (match) filters.contains_character = match[1];
    }
    if (lowerQuery.includes('first vowel')) {
      filters.contains_character = 'a'; // Heuristic for first vowel
    }

    if (Object.keys(filters).length === 0) {
      throw new Error('Unable to parse natural language query');
    }

    return filters;
  }
}

module.exports = StringService;