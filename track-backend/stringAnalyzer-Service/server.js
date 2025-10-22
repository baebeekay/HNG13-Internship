const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const stringRoutes = require('./routes/stringRoutes');
require('dotenv').config(); // Load .env file

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Basic health check
app.get('/', (req, res) => {
    res.send('String Analyzer Service is running.');
});

// API Routes
app.use('/strings', stringRoutes);

// Global error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('An internal server error occurred.');
});

// Initialize DB schema and start server
db.createSchema().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}).catch(err => {
    console.error("Failed to start server due to DB initialization error:", err);
    // Exit if DB is unavailable
    process.exit(1);
});
