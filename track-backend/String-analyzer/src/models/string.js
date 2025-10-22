const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const String = sequelize.define('String', {
  value: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  sha256Hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isPalindrome: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  length: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'Strings', // Ensure case matches database
  timestamps: true
});

module.exports = String;