// app.js
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const Jimp = require('jimp');

dotenv.config();

const app = express();
app.use(express.json());

// ========================================
// DATABASE CONNECTION
// ========================================
let pool;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Set it to the external connection string from Railway.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 5000,
    max: 10
  });

  console.log('PostgreSQL pool created');
} catch (err) {
  console.error('DB Pool Error:', err.message);
  process.exit(1);
}

// Test connection
(async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    client.release();
  } catch (err) {
    console.error('DB connection failed:', err.message);
  }
})();

// ========================================
// DATABASE INITIALIZATION
// ========================================
async function initDB() {
  const sql = `
    CREATE TABLE IF NOT EXISTS countries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_lower TEXT GENERATED ALWAYS AS (LOWER(name)) STORED,
      capital TEXT,
      region TEXT,
      population BIGINT NOT NULL,
      currency_code TEXT,
      exchange_rate NUMERIC(15,4),
      estimated_gdp NUMERIC(20,2),
      flag_url TEXT,
      last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_name_lower UNIQUE (name_lower)
    );

    CREATE INDEX IF NOT EXISTS idx_region ON countries(region);
    CREATE INDEX IF NOT EXISTS idx_currency ON countries(currency_code);
    CREATE INDEX IF NOT EXISTS idx_gdp ON countries(estimated_gdp DESC NULLS LAST);
  `;

  try {
    await pool.query(sql);
    console.log('Table and indexes ready');
  } catch (err) {
    console.error('DB Init Error:', err.message);
  }
}

initDB();

// ========================================
// CACHE SETUP
// ========================================
const CACHE_DIR = path.join(__dirname, 'cache');
const IMAGE_PATH = path.join(CACHE_DIR, 'summary.png');

(async () => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    console.log('Cache directory ensured:', CACHE_DIR);
  } catch (err) {
    console.error('Cache dir error:', err);
  }
})();

// ========================================
// HELPERS
// ========================================
const getRandomMultiplier = () => Math.random() * 1000 + 1000;

// ========================================
// POST /countries/refresh
// ========================================
app.post('/countries/refresh', async (req, res) => {
  let countriesData, ratesData;

  try {
    const resp = await axios.get(
      'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies',
      { timeout: 10000 }
    );
    countriesData = resp.data;
  } catch (err) {
    return res.status(503).json({
      error: 'External data source unavailable',
      details: 'Could not fetch data from countries API'
    });
  }

  try {
    const resp = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
    if (!resp.data.rates) throw new Error('Invalid rates');
    ratesData = resp.data.rates;
  } catch (err) {
    return res.status(503).json({
      error: 'External data source unavailable',
      details: 'Could not fetch data from exchange rates API'
    });
  }

  const now = new Date();

  try {
    for (const country of countriesData) {
      const { name, capital, region, population, flag, currencies } = country;
      if (!name || population == null) continue;

      let currency_code = null;
      let exchange_rate = null;
      let estimated_gdp = null;

      if (currencies && Array.isArray(currencies) && currencies.length > 0) {
        currency_code = currencies[0].code || null;
        if (currency_code && ratesData[currency_code]) {
          exchange_rate = parseFloat(ratesData[currency_code]);
          estimated_gdp = (population * getRandomMultiplier()) / exchange_rate;
        }
      } else {
        estimated_gdp = 0;
      }

      await pool.query(
        `
        INSERT INTO countries (
          name, capital, region, population, currency_code,
          exchange_rate, estimated_gdp, flag_url, last_refreshed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (name_lower) DO UPDATE SET
          capital = EXCLUDED.capital,
          region = EXCLUDED.region,
          population = EXCLUDED.population,
          currency_code = EXCLUDED.currency_code,
          exchange_rate = EXCLUDED.exchange_rate,
          estimated_gdp = EXCLUDED.estimated_gdp,
          flag_url = EXCLUDED.flag_url,
          last_refreshed_at = EXCLUDED.last_refreshed_at
        `,
        [
          name, capital || null, region || null, population,
          currency_code, exchange_rate, estimated_gdp, flag || null, now
        ]
      );
    }

    await generateSummaryImage(now.toISOString());
    return res.json({ message: 'Refresh completed successfully' });
  } catch (err) {
    console.error('Refresh failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// IMAGE GENERATION (FIXED)
// ========================================
async function generateSummaryImage(timestamp) {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) AS total FROM countries');
    const total = totalRes.rows[0].total;

    const topRes = await pool.query(`
      SELECT name, estimated_gdp
      FROM countries
      WHERE estimated_gdp IS NOT NULL
      ORDER BY estimated_gdp::NUMERIC DESC
      LIMIT 5
    `);

    const image = new Jimp(800, 600, 0xffffffff);
    const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    let y = 40;
    image.print(fontLarge, 50, y, 'Country Summary');
    y += 90;
    image.print(fontMedium, 50, y, `Total: ${total}`);
    y += 60;
    image.print(fontMedium, 50, y, `Refreshed: ${new Date(timestamp).toUTCString()}`);
    y += 80;
    image.print(fontMedium, 50, y, 'Top 5 by Est. GDP:');
    y += 60;

    topRes.rows.forEach((row, i) => {
      const gdp = row.estimated_gdp != null
        ? Number(row.estimated_gdp).toLocaleString('en-US', { maximumFractionDigits: 0 })
        : 'N/A';
      image.print(fontSmall, 70, y, `${i + 1}. ${row.name}: $${gdp}`);
      y += 40;
    });

    await fs.mkdir(CACHE_DIR, { recursive: true });
    await image.writeAsync(IMAGE_PATH);
    console.log('Summary image saved:', IMAGE_PATH);
  } catch (err) {
    console.error('Image generation failed:', err.message);
  }
}

// ========================================
// GET /countries
// ========================================
app.get('/countries', async (req, res) => {
  const { region, currency, sort } = req.query;
  let query = 'SELECT * FROM countries';
  const where = [];
  const params = [];
  let idx = 1;

  if (region) { where.push(`region = $${idx++}`); params.push(region); }
  if (currency) { where.push(`currency_code = $${idx++}`); params.push(currency); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');

  if (sort === 'gdp_desc') {
    query += ' ORDER BY estimated_gdp::NUMERIC DESC NULLS LAST';
  } else {
    query += ' ORDER BY name ASC';
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /countries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// GET /countries/:name
// ========================================
app.get('/countries/:name', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM countries WHERE name_lower = LOWER($1)',
      [req.params.name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Country not found' });
hi });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// DELETE /countries/:name
// ========================================
app.delete('/countries/:name', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM countries WHERE name_lower = LOWER($1)',
      [req.params.name]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Country not found' });
    }
    res.json({ message: 'Country deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// GET /status
// ========================================
app.get('/status', async (req, res) => {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) AS total FROM countries');
    const timeRes = await pool.query('SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries');

    res.json({
      total_countries: parseInt(totalRes.rows[0].total),
      last_refreshed_at: timeRes.rows[0].last_refreshed_at
        ? new Date(timeRes.rows[0].last_refreshed_at).toISOString()
        : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================
// GET /countries/image
// ========================================
app.get('/countries/image', async (req, res) => {
  try {
    await fs.access(IMAGE_PATH);
    res.sendFile(IMAGE_PATH);
  } catch {
    res.status(404).json({ error: 'Summary image not found' });
  }
});

// ========================================
// HEALTH CHECK
// ========================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', db: 'connected' });
  } catch {
    res.status(500).json({ status: 'unhealthy', db: 'disconnected' });
  }
});

// ========================================
// ERROR HANDLING
// ========================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});