const request = require('supertest');
const app = require('../src/app');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

describe('String Analyzer API', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE TABLE strings RESTART IDENTITY');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create a new string', async () => {
    const res = await request(app)
      .post('/api/strings')
      .send({ value: 'hello world' });
    expect(res.status).toBe(201);
    expect(res.body.properties.length).toBe(11);
  });

  it('should get a specific string', async () => {
    await request(app).post('/api/strings').send({ value: 'hello world' });
    const res = await request(app).get('/api/strings/hello%20world');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('hello world');
  });

  // Add more tests for other endpoints
});