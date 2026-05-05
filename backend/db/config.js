function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
    };
  }

  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

function getDatabaseEnvStatus() {
  return {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbName: process.env.DB_NAME,
    dbUser: process.env.DB_USER,
    hasDbPassword: Boolean(process.env.DB_PASSWORD),
  };
}

module.exports = {
  getDatabaseConfig,
  getDatabaseEnvStatus,
};
