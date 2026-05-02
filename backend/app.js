const express = require('express');
const authRoutes = require('./routes/auth.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const setupSwagger = require('./swagger');
const cors = require("cors");

const app = express();

// Setup CORS to allow requests from the deployed Amplify frontend or local dev
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000"
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
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

module.exports = app;
