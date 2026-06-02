const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "document_intelligence",
  password: "naglar2026",
  port: 5432,
});

module.exports = pool;