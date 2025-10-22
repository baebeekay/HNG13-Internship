
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
  timestamps: true
});

module.exports = String;