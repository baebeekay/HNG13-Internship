function parseNaturalLanguageQuery(query) {
  const lowerQuery = query.toLowerCase().trim();
  const filters = {};

  if (lowerQuery.includes('single word')) filters.word_count = 1;
  if (lowerQuery.includes('palindromic') || lowerQuery.includes('palindrome')) filters.is_palindrome = true;
  const lengthMatch = lowerQuery.match(/longer than (\d+)/);
  if (lengthMatch) filters.min_length = parseInt(lengthMatch[1]) + 1;
  const charMatch = lowerQuery.match(/containing the letter (\w)/);
  if (charMatch && charMatch[1].length === 1) filters.contains_character = charMatch[1];
  if (lowerQuery.includes('first vowel')) filters.contains_character = 'a';

  if (Object.keys(filters).length === 0) throw new Error('No valid filters parsed');
  return filters;
}

module.exports = { parseNaturalLanguageQuery };
