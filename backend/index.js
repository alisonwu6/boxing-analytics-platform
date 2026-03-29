const app = require('./app');
const pool = require('./db/pool');

const port = process.env.PORT || 3001;

async function startServer() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('DB connected:', result.rows[0]);
  } catch (error) {
    console.warn('DB unavailable, starting in local-file mode:', error.message);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
