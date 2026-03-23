const app = require('./app');
const pool = require('./db/pool');

const port = process.env.PORT || 3001;

async function startServer() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('DB connected:', result.rows[0]);

    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to DB:', error.message);
    process.exit(1);
  }
}

startServer();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
