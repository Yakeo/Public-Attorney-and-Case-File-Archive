const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'attorney_case_db',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

const db = pool.promise();

// Connection check on initial server start
pool.getConnection((err, conn) => {
  if (err) {
    console.error('Database connection error:', err.message);
    return;
  }
  console.log(`Connected to MySQL database: ${process.env.DB_NAME || 'attorney_case_db'}`);
  conn.release();
});

module.exports = db;