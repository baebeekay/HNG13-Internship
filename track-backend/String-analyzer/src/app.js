const express = require('express');
const stringsRouter = require('./routes/strings');
const sequelize = require('./config/database');

const app = express();
app.use(express.json());
app.use('/strings', stringsRouter);

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = { app, sequelize };
