const express = require('express');
const app = express();
const stringsRouter = require('./routes/strings');
const sequelize = require('./config/database');

app.use(express.json());
app.use('/strings', stringsRouter);

app.get('/', (req, res) => res.send('String Analyzer Service is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true }); // Reset database on startup
    console.log('Database connection and sync successful');
  } catch (error) {
    console.error('Startup error:', error);
  }
});

app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;