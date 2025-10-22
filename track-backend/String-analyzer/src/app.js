const express = require('express');
const stringRoutes = require('./routes/stringRoutes');

const app = express();
app.use(express.json()); // Middleware to parse JSON
app.use('/api', stringRoutes); // Mount routes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));