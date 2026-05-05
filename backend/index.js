const path = require("path");
const dotenv = require("dotenv");

// Always load backend/.env first, before importing app/routes/services
const envPath = path.resolve(__dirname, ".env");

const envResult = dotenv.config({
  path: envPath,
  override: true,
});

if (envResult.error) {
  console.warn("[ENV WARNING] Could not load .env file:", envResult.error.message);
} else {
  console.log("[ENV] Loaded .env from:", envPath);
  console.log("[ENV] Variables loaded:", Object.keys(envResult.parsed || {}).length);
}

console.log("[ENV CHECK]", {
  port: process.env.PORT,
  python: process.env.PYTHON_BIN,
  uploadProvider: process.env.UPLOAD_PROVIDER,
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.S3_REGION,
  bucket: process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET,
  hasAwsKey: Boolean(process.env.AWS_ACCESS_KEY_ID),
  hasAwsSecret: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
  hasAwsSessionToken: Boolean(process.env.AWS_SESSION_TOKEN),
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  pgHost: process.env.PGHOST,
  pgPort: process.env.PGPORT,
  pgDatabase: process.env.PGDATABASE,
  pgUser: process.env.PGUSER,
  hasPgPassword: Boolean(process.env.PGPASSWORD),
  hasJwtSecret: Boolean(process.env.JWT_SECRET),
});

// Import app only after .env is loaded
const appModule = require("./app");
const app = appModule.default || appModule.app || appModule;

if (!app || typeof app.listen !== "function") {
  console.error(
    "[BOOT ERROR] ./app.js must export an Express app. Example: module.exports = app;"
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;

async function testDatabaseConnection() {
  try {
    // Prefer pg because your .env uses PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
    const { Pool } = require("pg");

    const pool = new Pool({
      host: process.env.PGHOST || "127.0.0.1",
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      connectionString: process.env.DATABASE_URL || undefined,
    });

    const result = await pool.query("SELECT NOW()");
    console.log("DB connected:", result.rows[0]);

    await pool.end();
  } catch (error) {
    console.warn("[DB WARNING] Database connection check failed.");
    console.warn("[DB WARNING]", error.message);
    console.warn(
      "[DB WARNING] Server will still start, but login/session APIs may fail if DB is unavailable."
    );
  }
}

async function startServer() {
  await testDatabaseConnection();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[BOOT ERROR]", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});
