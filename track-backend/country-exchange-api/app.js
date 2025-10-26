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

// PostgreSQL Pool from Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway
  }
});

// Initialize DB Table
async function initDB() {
  const createTableSQL = `
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

    CREATE INDEX IF NOT EXISTS idx_countries_region ON countries(region);
    CREATE INDEX IF NOT EXISTS idx_countries_currency ON countries(currency_code);
    CREATE INDEX IF NOT EXISTS idx_countries_gdp ON countries(estimated_gdp DESC NULLS LAST);
  `;

  try {
    await pool.query(createTableSQL);
    console.log('PostgreSQL table and indexes ready.');
  } catch (err) {
    console.error('DB Init Error:', err);
    process.exit(1);
  }
}

initDB();

// Cache directory
const CACHE_DIR = path.join(__dirname, 'cache');
const IMAGE_PATH = path.join(CACHE_DIR, 'summary.png');

(async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
})();

// Helper: Random multiplier (1000–2000)
function getRandomMultiplier() {
  return Math.random() * 1000 + 1000;
}

// POST /countries/refresh
app.post('/countries/refresh', async (req, res) => {
  let countriesData, ratesData;

  // 1. Fetch countries
  try {
    const resp = await axios.get(
      'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies'
    );
    countriesData = resp.data;
  } catch (err) {
    return res.status(503).json({
      error: 'External data source unavailable',
      details: 'Could not fetch data from countries API'
    });
  }

  // 2. Fetch exchange rates
  try {
    const resp = await axios.get('https://open.er-api.com/v6/latest/USD');
    if (!resp.data.rates) throw new Error('Invalid rates data');
    ratesData = resp.data.rates;
  } catch (err) {
    return res.status(503).json({
      error: 'External data source unavailable',
      details: 'Could not fetch data from exchange rates API'
    });
  }

  const now = new Date();
  const timestamp = now.toISOString();

  try {
    for (const country of countriesData) {
      const { name, capital, region, population, flag, currencies } = country;

      if (!name || population == null) continue;

      let currency_code = null;
      let exchange_rate = null;
      let estimated_gdp = 0;

      if (currencies && Array.isArray(currencies) && currencies.length > 0) {
        const firstCurrency = currencies[0];
        currency_code = firstCurrency.code || null;

        if (currency_code && ratesData[currency_code]) {
          exchange_rate = parseFloat(ratesData[currency_code]);
          const multiplier = getRandomMultiplier();
          estimated_gdp = (population * multiplier) / exchange_rate;
        }
      }

      // UPSERT using ON CONFLICT
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
          name, capital || null, region || null, population, currency_code,
          exchange_rate, estimated_gdp, flag || null, now
        ]
      );
    }

    // Generate image
    await generateSummaryImage(timestamp);

    return res.json({ message: 'Refresh completed successfully' });
  } catch (err) {
    console.error('Refresh DB Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate Summary Image
async function generateSummaryImage(timestamp) {
  const totalRes = await pool.query('SELECT COUNT(*) AS total FROM countries');
  const total = totalRes.rows[0].total;

  const topRes = await pool.query(`
    SELECT name, estimated_gdp
    FROM countries
    WHERE estimated_gdp IS NOT NULL
    ORDER BY estimated_gdp DESC
    LIMIT 5
  `);

  const image = new Jimp(800, 600, 0xffffffff);
  const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  let y = 40;
  image.print(fontLarge, 50, y, 'Country Data Summary');
  y += 90;

  image.print(fontMedium, 50, y, `Total Countries: ${total}`);
  y += 60;

  const formattedTime = `${timestamp.split('T')[0]} ${timestamp.split('T')[1].slice(0,8)} UTC`;
  image.print(fontMedium, 50, y, `Last Refresh: ${formattedTime}`);
  y += 80;

  image.print(fontMedium, 50, y, 'Top 5 by Estimated GDP:');
  y += 60;

  topRes.rows.forEach((row, i) => {
    const gdp = row.estimated_gdp ? Number(row.estimated_gdp).toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'N/A';
    image.print(fontSmall, 70, y, `${i + 1}. ${row.name}: $${gdp}`);
    y += 40;
  });

  await image.writeAsync(IMAGE_PATH);
}

// GET /countries
app.get('/countries', async (req, res) => {
  const { region, currency, sort } = req.query;

  let query = 'SELECT * FROM countries';
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (region) {
    where.push(`region = $${paramIndex++}`);
    params.push(region);
  }
  if (currency) {
    where.push(`currency_code = $${paramIndex++}`);
    params.push(currency);
  }
  if (where.length) query += ' WHERE ' + where.join(' AND ');

  if (sort === 'gdp_desc') {
    query += ' ORDER BY estimated_gdp DESC NULLS LAST';
  } else {
    query += ' ORDER BY name ASC';
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /countries/:name
app.get('/countries/:name', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM countries WHERE name_lower = LOWER($1)',
    [req.params.name]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Country not found' });
  }
  res.json(result.rows[0]);
});

// DELETE /countries/:name
app.delete('/countries/:name', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM countries WHERE name_lower = LOWER($1)',
    [req.params.name]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Country not found' });
  }
  res.json({ message: 'Country deleted successfully' });
});

// GET /status
app.get('/status', async (req, res) => {
  const totalRes = await pool.query('SELECT COUNT(*) AS total FROM countries');
  const timeRes = await pool.query('SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries');

  const last = timeRes.rows[0].last_refreshed_at
    ? new Date(timeRes.rows[0].last_refreshed_at).toISOString()
    : null;

  res.json({
    total_countries: parseInt(totalRes.rows[0].total),
    last_refreshed_at: last
  });
});

// GET /countries/image
app.get('/countries/image', async (req, res) => {
  try {
    await fs.access(IMAGE_PATH);
    res.sendFile(IMAGE_PATH);
  } catch {
    res.status(404).json({ error: 'Summary image not found' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
