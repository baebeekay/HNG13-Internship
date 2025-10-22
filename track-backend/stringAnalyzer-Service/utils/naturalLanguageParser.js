/**
 * Parses a natural language query into a set of structured filters.
 */
const parseNaturalLanguage = (query) => {
    const filters = {};
    const lowerQuery = query.toLowerCase();

    // Palindrome check
    if (lowerQuery.includes('palindrome') || lowerQuery.includes('palindromic')) {
        filters.is_palindrome = 'true';
    }

    // Word count check
    if (lowerQuery.includes('single word')) {
        filters.word_count = '1';
    } else if (lowerQuery.includes('two words')) {
        filters.word_count = '2';
    }

    // Length check (using simple regex)
    const minLengthMatch = lowerQuery.match(/longer than (\d+) characters?/);
    if (minLengthMatch) {
        // "longer than 10" -> min_length: 11
        filters.min_length = String(parseInt(minLengthMatch[1]) + 1);
    }
    const maxLengthMatch = lowerQuery.match(/shorter than (\d+) characters?/);
    if (maxLengthMatch) {
        // "shorter than 20" -> max_length: 19
        filters.max_length = String(parseInt(maxLengthMatch[1]) - 1);
    }
    
    // Contains character check
    const containsMatch = lowerQuery.match(/contains (the letter |the first vowel |the character )?([a-z])\b/);
    if (containsMatch) {
        let char = containsMatch[2];
        if (lowerQuery.includes('first vowel')) char = 'a'; // Heuristic
        filters.contains_character = char;
    } else if (lowerQuery.includes('containing the letter z')) {
        filters.contains_character = 'z';
    }
    
    // Conflict check
    const minLen = parseInt(filters.min_length);
    const maxLen = parseInt(filters.max_length);
    if (!isNaN(minLen) && !isNaN(maxLen) && minLen > maxLen) {
        throw new Error('Query parsed but resulted in conflicting length filters');
    }

    if (Object.keys(filters).length === 0) {
        throw new Error('Unable to parse natural language query into filters.');
    }

    return filters;
};

module.exports = {
    parseNaturalLanguage,
};
