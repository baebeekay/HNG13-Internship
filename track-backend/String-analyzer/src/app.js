const express = require('express');
const stringsRouter = require('./routes/strings');
const sequelize = require('./config/database');

const app = express();
app.use(express.json());
app.use('/strings', stringsRouter);

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});



const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, sequelize };
