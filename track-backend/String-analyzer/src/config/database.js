const { Sequelize } = require('sequelize');

console.log('All Environment Variables:', JSON.stringify(process.env, null, 2));

let sequelize;
try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  sequelize = new Sequelize(databaseUrl, { dialect: 'postgres', logging: console.log });
  console.log('Database connection established');
} catch (error) {
  console.error('Database connection failed:', error);
  process.exit(1); // Exit to force container restart and log error
}

module.exports = sequelize;