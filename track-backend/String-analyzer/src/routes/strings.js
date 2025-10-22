const express = require('express');
const router = express.Router();
const String = require('../models/string');
const crypto = require('crypto');
const { Op, Sequelize } = require('sequelize'); // Import Sequelize for raw queries

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
    if (typeof body !== 'object' || body === null) return res.status(400).json({ error: 'Invalid JSON format' });
    const { value } = body;
    if (!value) return res.status(400).json({ error: 'Value field is required' });
    if (typeof value !== 'string') return res.status(400).json({ error: 'Value must be a string' });

    const existing = await String.findOne({ where: { value } });
    if (existing) return res.status(409).json({ error: 'String already exists' });

    const sha256Hash = calculateSHA256(value);
    const length = value.length;
    const isPalindromeResult = isPalindrome(value);

    const newString = await String.create({ value, sha256Hash, length, isPalindrome: isPalindromeResult });
    res.status(201).json({ data: newString });
  } catch (error) {
    console.error('POST /strings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /strings/{string_value}
router.get('/:string_value', async (req, res) => {
  try {
    const { string_value } = req.params;
    const string = await String.findOne({ where: { value: string_value } });
    if (!string) return res.status(404).json({ error: 'String not found' });
    res.json({ data: string });
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

    if (minLength) where.length = { ...where.length, [Op.gte]: parseInt(minLength) };
    if (maxLength) where.length = { ...where.length, [Op.lte]: parseInt(maxLength) };
    if (isPalindrome !== undefined) where.isPalindrome = isPalindrome === 'true';

    const strings = await String.findAll({ where });
    res.json({ data: strings });
  } catch (error) {
    console.error('GET /strings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /strings/filter-by-natural-language
router.get('/filter-by-natural-language', async (req, res) => {
  try {
    const { language } = req.query;
    if (!language) return res.status(400).json({ error: 'Language query parameter is required' });

    const keywords = {
      english: ['the', 'is', 'and'],
      spanish: ['el', 'es', 'y'],
      french: ['le', 'est', 'et']
    };

    const langKeywords = keywords[language.toLowerCase()];
    if (!langKeywords) return res.status(400).json({ error: 'Unsupported language' });

    // Use Sequelize.or to check for any keyword
    const conditions = langKeywords.map(keyword => ({
      [Op.like]: `%${keyword.toLowerCase()}%`
    }));
    const whereClause = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('value')), {
      [Op.or]: conditions
    });

    const strings = await String.findAll({ where: whereClause });
    res.json({ data: strings });
  } catch (error) {
    console.error('GET /filter-by-natural-language error:', error);
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