const express = require('express');
const { analyzeString } = require('../services/stringService');
const String = require('../models/string');
const { parseNaturalLanguageQuery } = require('../utils/naturalLanguage');

const router = express.Router();

// POST /strings
router.post('/', async (req, res) => {
  const { value } = req.body;
  if (!value || typeof value !== 'string') {
    return res.status(400).json({ error: 'Invalid request body or missing "value" field' });
  }

  try {
    const existing = await String.findOne({ where: { value } });
    if (existing) {
      return res.status(409).json({ error: 'String already exists' });
    }

    const properties = analyzeString(value);
    const string = await String.create({
      id: properties.sha256_hash,
      value,
      properties,
    });

    res.status(201).json({
      id: string.id,
      value: string.value,
      properties: string.properties,
      created_at: string.created_at,
    });
  } catch (error) {
    if (error.message === 'Input must be a string') {
      return res.status(422).json({ error: 'Invalid data type for "value"' });
    }
    throw error;
  }
});

// GET /strings/{string_value}
router.get('/:stringValue', async (req, res) => {
  const string = await String.findOne({ where: { value: req.params.stringValue } });
  if (!string) {
    return res.status(404).json({ error: 'String not found' });
  }

  res.status(200).json({
    id: string.id,
    value: string.value,
    properties: string.properties,
    created_at: string.created_at,
  });
});

// GET /strings (with filtering)
router.get('/', async (req, res) => {
  const { is_palindrome, min_length, max_length, word_count, contains_character } = req.query;

  if (contains_character && contains_character.length !== 1) {
    return res.status(400).json({ error: 'contains_character must be a single character' });
  }

  const where = {};
  if (is_palindrome !== undefined) {
    where['properties.is_palindrome'] = is_palindrome === 'true';
  }
  if (min_length !== undefined) {
    where['properties.length'] = { [Op.gte]: parseInt(min_length) };
  }
  if (max_length !== undefined) {
    where['properties.length'] = { ...where['properties.length'], [Op.lte]: parseInt(max_length) };
  }
  if (word_count !== undefined) {
    where['properties.word_count'] = parseInt(word_count);
  }
  if (contains_character) {
    where.value = { [Op.like]: `%${contains_character}%` };
  }

  const strings = await String.findAll({ where });

  res.status(200).json({
    data: strings.map(s => ({
      id: s.id,
      value: s.value,
      properties: s.properties,
      created_at: s.created_at,
    })),
    count: strings.length,
    filters_applied: {
      is_palindrome: is_palindrome ? is_palindrome === 'true' : undefined,
      min_length: min_length ? parseInt(min_length) : undefined,
      max_length: max_length ? parseInt(max_length) : undefined,
      word_count: word_count ? parseInt(word_count) : undefined,
      contains_character,
    },
  });
});

// GET /strings/filter-by-natural-language
router.get('/filter-by-natural-language', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  let filters;
  try {
    filters = parseNaturalLanguageQuery(query);
  } catch (error) {
    return res.status(400).json({ error: 'Unable to parse natural language query' });
  }

  const where = {};
  if (filters.is_palindrome !== undefined) {
    where['properties.is_palindrome'] = filters.is_palindrome;
  }
  if (filters.min_length !== undefined) {
    where['properties.length'] = { [Op.gte]: filters.min_length };
  }
  if (filters.word_count !== undefined) {
    where['properties.word_count'] = filters.word_count;
  }
  if (filters.contains_character) {
    where.value = { [Op.like]: `%${filters.contains_character}%` };
  }

  const strings = await String.findAll({ where });

  res.status(200).json({
    data: strings.map(s => ({
      id: s.id,
      value: s.value,
      properties: s.properties,
      created_at: s.created_at,
    })),
    count: strings.length,
    interpreted_query: {
      original: query,
      parsed_filters: filters,
    },
  });
});

// DELETE /strings/{string_value}
router.delete('/:stringValue', async (req, res) => {
  const string = await String.findOne({ where: { value: req.params.stringValue } });
  if (!string) {
    return res.status(404).json({ error: 'String not found' });
  }

  await string.destroy();
  res.status(204).send();
});

module.exports = router;
