const express = require('express');
const router = express.Router();
const db = require('../db');
const { analyzeString } = require('../utils/stringAnalyzer');
const { parseNaturalLanguage } = require('../utils/naturalLanguageParser');

// Helper to format the DB row into the required API response structure
const formatResponse = (row) => ({
    id: row.id,
    value: row.value,
    properties: {
        length: row.length,
        is_palindrome: row.is_palindrome,
        unique_characters: row.unique_characters,
        word_count: row.word_count,
        sha256_hash: row.id,
        character_frequency_map: row.char_freq_map,
    },
    created_at: row.created_at.toISOString(),
});

/**
 * Helper function for structured and NLP filtering: Generates the SQL WHERE clause and values.
 */
const buildFilterQuery = (filters) => {
    let query = 'SELECT * FROM strings WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    // Filter Validation and Query Building
    if (filters.is_palindrome !== undefined) {
        const val = filters.is_palindrome === 'true';
        if (typeof val !== 'boolean') throw new Error('is_palindrome must be a boolean (true/false).');
        query += ` AND is_palindrome = $${paramIndex++}`;
        values.push(val);
    }
    if (filters.min_length) {
        const val = parseInt(filters.min_length);
        if (isNaN(val)) throw new Error('min_length must be an integer.');
        query += ` AND length >= $${paramIndex++}`;
        values.push(val);
    }
    // ... add similar logic for max_length and word_count ...
    if (filters.max_length) {
        const val = parseInt(filters.max_length);
        if (isNaN(val)) throw new Error('max_length must be an integer.');
        query += ` AND length <= $${paramIndex++}`;
        values.push(val);
    }
    if (filters.word_count) {
        const val = parseInt(filters.word_count);
        if (isNaN(val)) throw new Error('word_count must be an integer.');
        query += ` AND word_count = $${paramIndex++}`;
        values.push(val);
    }
    if (filters.contains_character) {
        const char = filters.contains_character;
        if (typeof char !== 'string' || char.length !== 1) throw new Error('contains_character must be a single character string.');
        query += ` AND value ILIKE $${paramIndex++}`; // ILIKE for case-insensitive contain check
        values.push(`%${char}%`);
    }

    query += ' ORDER BY created_at DESC';
    return { query, values };
};


// 1. POST /strings
router.post('/', async (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).send({ error: 'Missing "value" field.' });
    if (typeof value !== 'string') return res.status(422).send({ error: 'Invalid data type for "value", must be a string.' });

    try {
        const analysis = analyzeString(value);
        const { id, properties } = analysis;

        // Check for conflict (409)
        const conflict = await db.query('SELECT created_at FROM strings WHERE id = $1', [id]);
        if (conflict.rowCount > 0) return res.status(409).send({ error: 'String already exists in the system.' });

        // Insert new string
        await db.query(
            `INSERT INTO strings (id, value, length, is_palindrome, unique_characters, word_count, char_freq_map)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, value, properties.length, properties.is_palindrome, properties.unique_characters, properties.word_count, properties.character_frequency_map]
        );

        const result = await db.query('SELECT * FROM strings WHERE id = $1', [id]);
        return res.status(201).json(formatResponse(result.rows[0]));

    } catch (error) {
        console.error('POST /strings Error:', error.message);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});


// 2. GET /strings/{string_value}
router.get('/:stringValue', async (req, res) => {
    try {
        const { id } = analyzeString(req.params.stringValue);
        const result = await db.query('SELECT * FROM strings WHERE id = $1', [id]);

        if (result.rowCount === 0) return res.status(404).send({ error: 'String does not exist in the system.' });

        return res.status(200).json(formatResponse(result.rows[0]));

    } catch (error) {
        console.error('GET /strings/{value} Error:', error.message);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});


// 3. GET /strings?filters...
router.get('/', async (req, res) => {
    try {
        const filters = req.query;
        const { query, values } = buildFilterQuery(filters);

        const result = await db.query(query, values);
        
        return res.status(200).json({
            data: result.rows.map(formatResponse),
            count: result.rowCount,
            filters_applied: filters,
        });
    } catch (error) {
        console.error('GET /strings Error:', error.message);
        return res.status(400).send({ error: error.message || 'Invalid query parameter values or types.' });
    }
});


// 4. GET /strings/filter-by-natural-language?query=...
router.get('/filter-by-natural-language', async (req, res) => {
    const originalQuery = req.query.query;
    if (!originalQuery) return res.status(400).send({ error: 'Missing "query" parameter.' });

    try {
        const parsedFilters = parseNaturalLanguage(originalQuery);
        const { query, values } = buildFilterQuery(parsedFilters); // Reuse SQL generation
        const result = await db.query(query, values);

        return res.status(200).json({
            data: result.rows.map(formatResponse),
            count: result.rowCount,
            interpreted_query: {
                original: originalQuery,
                parsed_filters: parsedFilters
            }
        });
    } catch (error) {
        if (error.message.includes('Unable to parse')) return res.status(400).send({ error: error.message });
        if (error.message.includes('Conflicting')) return res.status(422).send({ error: error.message });

        console.error('GET /strings/filter-by-natural-language Error:', error.message);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});


// 5. DELETE /strings/{string_value}
router.delete('/:stringValue', async (req, res) => {
    try {
        const { id } = analyzeString(req.params.stringValue);
        const result = await db.query('DELETE FROM strings WHERE id = $1', [id]);

        if (result.rowCount === 0) return res.status(404).send({ error: 'String does not exist in the system.' });

        return res.status(204).send(); // No Content

    } catch (error) {
        console.error('DELETE /strings/{value} Error:', error.message);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
});


module.exports = router;
