const express = require('express');
const app = express();
const stringsRouter = require('./routes/strings');
const { Sequelize } = require('sequelize');
const sequelize = require('./config/database');

app.use(express.json());
app.use('/strings', stringsRouter);

// Health check
app.get('/', (req, res) => res.send('String Analyzer Service is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
});

module.exports = app;