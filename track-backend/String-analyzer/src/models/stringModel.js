const pool = require('../config/database');

class StringModel {
  static async create(stringData) {
    const query = `
      INSERT INTO strings (
        id, value, length, is_palindrome, unique_characters, word_count, sha256_hash, character_frequency_map, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      stringData.id,
      stringData.value,
      stringData.properties.length,
      stringData.properties.is_palindrome,
      stringData.properties.unique_characters,
      stringData.properties.word_count,
      stringData.properties.sha256_hash,
      stringData.properties.character_frequency_map,
      new Date(),
    ];

    try {
      const { rows } = await pool.query(query, values);
      return rows[0];
    } catch (error) {
      if (error.code === '23505') { // Duplicate key error
        throw new Error('String already exists');
      }
      throw error;
    }
  }

  static async findByHash(sha256_hash) {
    const query = 'SELECT * FROM strings WHERE sha256_hash = $1';
    const { rows } = await pool.query(query, [sha256_hash]);
    return rows[0];
  }

  static async findByFilters(filters) {
    let query = 'SELECT * FROM strings WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.is_palindrome !== undefined) {
      query += ` AND is_palindrome = $${paramCount++}`;
      values.push(filters.is_palindrome);
    }
    if (filters.min_length) {
      query += ` AND length >= $${paramCount++}`;
      values.push(filters.min_length);
    }
    if (filters.max_length) {
      query += ` AND length <= $${paramCount++}`;
      values.push(filters.max_length);
    }
    if (filters.word_count) {
      query += ` AND word_count = $${paramCount++}`;
      values.push(filters.word_count);
    }
    if (filters.contains_character) {
      query += ` AND value ILIKE $${paramCount++}`;
      values.push(`%${filters.contains_character}%`);
    }

    const { rows } = await pool.query(query, values);
    return rows;
  }

  static async deleteByHash(sha256_hash) {
    const query = 'DELETE FROM strings WHERE sha256_hash = $1 RETURNING *';
    const { rows } = await pool.query(query, [sha256_hash]);
    return rows[0];
  }
}

module.exports = StringModel;