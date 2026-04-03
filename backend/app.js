const express = require('express');
const authRoutes = require('./routes/auth.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const mlRoutes = require('./routes/ml.routes');
const setupSwagger = require('./swagger');
const cors = require("cors");

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
setupSwagger(app);

app.get('/health', (req, res) => {
  res.json({ message: 'Boxing API Running' });
});


app.use('/auth', authRoutes);
app.use(sessionsRoutes);
app.use('/ml', mlRoutes);

module.exports = app;
