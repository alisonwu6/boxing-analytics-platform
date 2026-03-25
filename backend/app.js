const express = require('express');
const authRoutes = require('./routes/auth.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const setupSwagger = require('./swagger');

const app = express();

app.use(express.json());
setupSwagger(app);

app.get('/health', (req, res) => {
  res.json({ message: 'Boxing API Running' });
});

app.use('/auth', authRoutes);
app.use('/sessions', sessionsRoutes);

module.exports = app;
