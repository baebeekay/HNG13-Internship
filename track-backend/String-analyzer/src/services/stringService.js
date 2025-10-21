const crypto = require('crypto');

function analyzeString(value) {
  if (typeof value !== 'string') throw new Error('Invalid input');
  const length = value.length;
  const isPalindrome = value.toLowerCase() === value.toLowerCase().split('').reverse().join('');
  const uniqueCharacters = new Set(value).size;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const sha256Hash = crypto.createHash('sha256').update(value).digest('hex');
  const characterFrequencyMap = {};
  for (const char of value) characterFrequencyMap[char] = (characterFrequencyMap[char] || 0) + 1;

  return {
    length,
    is_palindrome: isPalindrome,
    unique_characters: uniqueCharacters,
    word_count: wordCount,
    sha256_hash: sha256Hash,
    character_frequency_map: characterFrequencyMap,
  };
}

module.exports = { analyzeString };
