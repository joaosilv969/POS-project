const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "bar_user",
  password: process.env.DB_PASSWORD || "bar_password",
  database: process.env.DB_NAME || "bar_db",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: "Z",
});

module.exports = pool;
