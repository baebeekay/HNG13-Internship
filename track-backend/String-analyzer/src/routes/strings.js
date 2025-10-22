const express = require('express');
const router = express.Router();
const String = require('../models/string');
const crypto = require('crypto');
const { Op, Sequelize } = require('sequelize');
const { analyzeString } = require('../services/stringService');

// Helper functions
const isPalindrome = (str) => {
  const cleanStr = str.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
  return cleanStr === cleanStr.split('').reverse().join('');
};

const calculateSHA256 = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex');
};

// POST /strings
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (typeof body !== 'object' || body === null) {
      return res.status(400).json({ error: 'Invalid request body or missing "value" field' });
    }
    const { value } = body;
    if (!value) {
      return res.status(400).json({ error: 'Invalid request body or missing "value" field' });
    }
    if (typeof value !== 'string') {
      return res.status(422).json({ error: 'Invalid data type for "value" (must be string)' });
    }

    const existing = await String.findOne({ where: { value } });
    if (existing) {
      return res.status(409).json({ error: 'String already exists in the system' });
    }

    const analysis = analyzeString(value);
    const newString = await String.create({
      value,
      sha256Hash: analysis.sha256_hash,
      isPalindrome: analysis.is_palindrome,
      length: analysis.length,
      wordCount: analysis.word_count
    });
    const responseData = {
      value: newString.value,
      sha256Hash: newString.sha256Hash,
      isPalindrome: newString.isPalindrome,
      length: newString.length,
      wordCount: newString.wordCount,
      id: newString.id,
      createdAt: newString.createdAt,
      updatedAt: newString.updatedAt
    };
    res.status(201).json({ data: responseData });
  } catch (error) {
    console.error('POST /strings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /strings/filter-by-natural-language
router.get('/filter-by-natural-language', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    const { parseNaturalLanguageQuery } = require('../utils/naturalLanguage');
    const filters = parseNaturalLanguageQuery(query);

    let where = {};
    if (filters.word_count) where.wordCount = filters.word_count;
    if (filters.is_palindrome) where.isPalindrome = filters.is_palindrome;
    if (filters.min_length) where.length = { ...where.length, [Op.gte]: filters.min_length };
    if (filters.contains_character) {
      where.value = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('value')), {
        [Op.like]: `%${filters.contains_character}%`
      });
    }

    const strings = await String.findAll({ where });
    const responseData = strings.map(string => ({
      value: string.value,
      sha256Hash: string.sha256Hash,
      isPalindrome: string.isPalindrome,
      length: string.length,
      wordCount: string.wordCount,
      id: string.id,
      createdAt: string.createdAt,
      updatedAt: string.updatedAt
    }));
    res.json({ data: responseData });
  } catch (error) {
    if (error.message === 'Unable to parse natural language query') {
      return res.status(400).json({ error: error.message });
    } else if (error.message === 'Query parsed but resulted in conflicting filters') {
      return res.status(422).json({ error: error.message });
    }
    console.error('GET /filter-by-natural-language error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /strings/{string_value}
router.get('/:string_value', async (req, res) => {
  try {
    const { string_value } = req.params;
    const string = await String.findOne({ where: { value: string_value } });
    if (!string) return res.status(404).json({ error: 'String not found' });

    const responseData = {
      value: string.value,
      sha256Hash: string.sha256Hash,
      isPalindrome: string.isPalindrome,
      length: string.length,
      wordCount: string.wordCount,
      id: string.id,
      createdAt: string.createdAt,
      updatedAt: string.updatedAt
    };

    // Check for wrong value returned
    if (responseData.value !== string_value) {
      return res.status(400).json({ error: 'Wrong value returned' });
    }

    // Check for missing properties
    const requiredProperties = ['value', 'sha256Hash', 'isPalindrome', 'length', 'wordCount', 'id', 'createdAt', 'updatedAt'];
    const missingProperties = requiredProperties.filter(prop => !(prop in responseData));
    if (missingProperties.length > 0) {
      return res.status(400).json({ error: `Missing properties: ${missingProperties.join(', ')}` });
    }

    res.json({ data: responseData });
  } catch (error) {
    console.error('GET /strings/:string_value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /strings with filters
router.get('/', async (req, res) => {
  try {
    const { minLength, maxLength, isPalindrome } = req.query;
    let where = {};

    if (minLength) where.length = { ...where.length, [Op.gte]: parseInt(minLength) || 0 };
    if (maxLength) where.length = { ...where.length, [Op.lte]: parseInt(maxLength) || Infinity };
    if (isPalindrome !== undefined) where.isPalindrome = isPalindrome === 'true';

    const strings = await String.findAll({ where });
    const responseData = strings.map(string => ({
      value: string.value,
      sha256Hash: string.sha256Hash,
      isPalindrome: string.isPalindrome,
      length: string.length,
      wordCount: string.wordCount,
      id: string.id,
      createdAt: string.createdAt,
      updatedAt: string.updatedAt
    }));
    res.json({ data: responseData });
  } catch (error) {
    console.error('GET /strings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /strings/{string_value}
router.delete('/:string_value', async (req, res) => {
  try {
    const { string_value } = req.params;
    const deleted = await String.destroy({ where: { value: string_value } });
    if (deleted === 0) return res.status(404).json({ error: 'String not found' });
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /strings/:string_value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;