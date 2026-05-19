const express = require('express');
const authRoutes = require('./routes/auth.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const setupSwagger = require('./swagger');
const cors = require("cors");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});
setupSwagger(app);

app.get('/health', (req, res) => {
  res.json({ message: 'Boxing API Running' });
});


app.use('/auth', authRoutes);
app.use(sessionsRoutes);

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
