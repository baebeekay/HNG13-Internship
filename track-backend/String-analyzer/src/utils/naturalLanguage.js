function parseNaturalLanguageQuery(query) {
  const lowerQuery = query.toLowerCase().trim();
  const filters = {};

  if (lowerQuery.includes('single word')) filters.word_count = 1;
  if (lowerQuery.includes('palindromic') || lowerQuery.includes('palindrome')) filters.is_palindrome = true;
  const minLengthMatch = lowerQuery.match(/longer than (\d+)/);
  if (minLengthMatch) filters.min_length = parseInt(minLengthMatch[1]) + 1;
  const maxLengthMatch = lowerQuery.match(/shorter than (\d+)/);
  if (maxLengthMatch) filters.max_length = parseInt(maxLengthMatch[1]) - 1;
  const charMatch = lowerQuery.match(/containing the letter (\w)/);
  if (charMatch && charMatch[1].length === 1) filters.contains_character = charMatch[1].toLowerCase();
  if (lowerQuery.includes('first vowel')) filters.contains_character = 'a';

  if (Object.keys(filters).length === 0) {
    throw new Error('Unable to parse natural language query');
  }

  if (filters.min_length && filters.max_length && filters.min_length > filters.max_length) {
    throw new Error('Query parsed but resulted in conflicting filters');
  }

  return filters;
}

module.exports = { parseNaturalLanguageQuery };