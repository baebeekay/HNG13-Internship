const { Sequelize } = require('sequelize');

// Load environment variables
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', // Adjust if using MySQL, SQLite, etc.
  logging: process.env.NODE_ENV === 'development' ? console.log : false, // Log SQL in development
  define: {
    timestamps: true, // Ensures createdAt and updatedAt are managed
    underscored: false, // Use camelCase (matches your model)
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Test the connection
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
})();

module.exports = sequelize;