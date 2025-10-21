const { analyzeString } = require('../src/services/stringService');

describe('String Service', () => {
  test('analyzes a string correctly', () => {
    const result = analyzeString('hello world');
    expect(result).toMatchObject({
      length: 11,
      is_palindrome: false,
      unique_characters: 8,
      word_count: 2,
      sha256_hash: expect.any(String),
      character_frequency_map: {
        h: 1,
        e: 1,
        l: 3,
        o: 1,
        ' ': 1,
        w: 1,
        r: 1,
        d: 1,
      },
    });
  });
});
