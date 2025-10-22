const express = require('express');
const stringRoutes = require('./routes/stringRoutes');
require('./config/database'); // Initialize PostgreSQL connection

const app = express();

app.use(express.json());
app.use('/api', stringRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;