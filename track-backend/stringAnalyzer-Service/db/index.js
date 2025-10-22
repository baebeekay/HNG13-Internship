const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Function to initialize the database schema
const createSchema = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS strings (
                id VARCHAR(64) PRIMARY KEY,
                value TEXT NOT NULL,
                length INTEGER NOT NULL,
                is_palindrome BOOLEAN NOT NULL,
                unique_characters INTEGER NOT NULL,
                word_count INTEGER NOT NULL,
                char_freq_map JSONB,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database schema checked/created successfully.");
    } catch (err) {
        console.error("Error creating database schema:", err);
        throw err; // Propagate error to stop server start
    }
};

module.exports = {
    query: (text, params) => pool.query(text, params),
    createSchema,
    pool,
};
