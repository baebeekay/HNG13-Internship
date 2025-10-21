const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const String = sequelize.define('String', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false, unique: true },
  properties: { type: DataTypes.JSONB, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'strings', timestamps: false });

module.exports = String;
