const { Pool } = require('pg');
require('dotenv').config();
const { getDatabaseConfig } = require('./config');

const pool = new Pool(getDatabaseConfig());

module.exports = pool;
