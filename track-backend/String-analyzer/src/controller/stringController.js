const StringModel = require('../models/stringModel');
const StringService = require('../services/stringService');

class StringController {
  static async createString(req, res) {
    try {
      const { value } = req.body;
      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing "value" field' });
      }

      const properties = StringService.analyzeString(value);
      const stringData = {
        id: properties.sha256_hash,
        value,
        properties,
      };

      try {
        const newString = await StringModel.create(stringData);
        res.status(201).json({
          id: newString.id,
          value: newString.value,
          properties: {
            length: newString.length,
            is_palindrome: newString.is_palindrome,
            unique_characters: newString.unique_characters,
            word_count: newString.word_count,
            sha256_hash: newString.sha256_hash,
            character_frequency_map: newString.character_frequency_map,
          },
          created_at: newString.created_at,
        });
      } catch (error) {
        if (error.message === 'String already exists') {
          return res.status(409).json({ error: 'String already exists' });
        }
        throw error;
      }
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  }

  static async getString(req, res) {
    try {
      const value = req.params.value;
      const properties = StringService.analyzeString(value);
      const string = await StringModel.findByHash(properties.sha256_hash);

      if (!string) {
        return res.status(404).json({ error: 'String not found' });
      }

      res.status(200).json({
        id: string.id,
        value: string.value,
        properties: {
          length: string.length,
          is_palindrome: string.is_palindrome,
          unique_characters: string.unique_characters,
          word_count: string.word_count,
          sha256_hash: string.sha256_hash,
          character_frequency_map: string.character_frequency_map,
        },
        created_at: string.created_at,
      });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  }

  static async getAllStrings(req, res) {
    try {
      const { is_palindrome, min_length, max_length, word_count, contains_character } = req.query;
      const filters = {};

      if (is_palindrome) filters.is_palindrome = is_palindrome === 'true';
      if (min_length) filters.min_length = parseInt(min_length);
      if (max_length) filters.max_length = parseInt(max_length);
      if (word_count) filters.word_count = parseInt(word_count);
      if (contains_character) filters.contains_character = contains_character;

      const strings = await StringModel.findByFilters(filters);
      res.status(200).json({
        data: strings.map((s) => ({
          id: s.id,
          value: s.value,
          properties: {
            length: s.length,
            is_palindrome: s.is_palindrome,
            unique_characters: s.unique_characters,
            word_count: s.word_count,
            sha256_hash: s.sha256_hash,
            character_frequency_map: s.character_frequency_map,
          },
          created_at: s.created_at,
        })),
        count: strings.length,
        filters_applied: req.query,
      });
    } catch (error) {
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  }

  static async filterByNaturalLanguage(req, res) {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }

      const parsedFilters = StringService.parseNaturalLanguage(query);
      const strings = await StringModel.findByFilters(parsedFilters);

      res.status(200).json({
        data: strings.map((s) => ({
          id: s.id,
          value: s.value,
          properties: {
            length: s.length,
            is_palindrome: s.is_palindrome,
            unique_characters: s.unique_characters,
            word_count: s.word_count,
            sha256_hash: s.sha256_hash,
            character_frequency_map: s.character_frequency_map,
          },
          created_at: s.created_at,
        })),
        count: strings.length,
        interpreted_query: {
          original: query,
          parsed_filters: parsedFilters,
        },
      });
    } catch (error) {
      res.status(error.message.includes('parse') ? 400 : 422).json({ error: error.message });
    }
  }

  static async deleteString(req, res) {
    try {
      const value = req.params.value;
      const properties = StringService.analyzeString(value);
      const result = await StringModel.deleteByHash(properties.sha256_hash);

      if (!result) {
        return res.status(404).json({ error: 'String not found' });
      }

      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  }
}

module.exports = StringController;
