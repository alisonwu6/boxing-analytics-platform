const app = require('./app');
const pool = require('./db/pool');
const { PrismaClient } = require('./generated/prisma')
const prisma = new PrismaClient()

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

// async function testDB() {
//   const user = await prisma.user.create({
//     data: {
//       email: "test@example.com",
//       password: "123456",
//       name: "test"
//     }
//   })

//   console.log("User created:", user)
// }

// testDB()

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

