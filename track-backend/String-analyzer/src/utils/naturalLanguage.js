// src/utils/naturalLanguage.js
function parseNaturalLanguageQuery(query) {
  const lowerQuery = query.toLowerCase().trim();
  const filters = {};

  // Parse specific query patterns
  if (lowerQuery.includes('single word')) filters.word_count = 1;
  if (lowerQuery.includes('palindromic') || lowerQuery.includes('palindrome')) filters.is_palindrome = true;
  const lengthMatch = lowerQuery.match(/longer than (\d+)/);
  if (lengthMatch) filters.min_length = parseInt(lengthMatch[1]) + 1;
  const charMatch = lowerQuery.match(/containing the letter (\w)/);
  if (charMatch && charMatch[1].length === 1) filters.contains_character = charMatch[1].toLowerCase();
  if (lowerQuery.includes('first vowel')) filters.contains_character = 'a';

  // Validate and handle conflicts
  if (Object.keys(filters).length === 0) {
    throw new Error('Unable to parse natural language query');
  }

  // Check for conflicting filters
  if (filters.min_length && filters.max_length && filters.min_length > filters.max_length) {
    throw new Error('Query parsed but resulted in conflicting filters');
  }

  return filters;
}

module.exports = { parseNaturalLanguageQuery };
