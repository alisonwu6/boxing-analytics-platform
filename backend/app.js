const express = require('express');
const sessionsRoutes = require('./routes/sessions.routes');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ message: 'Boxing API Running' });
});

app.use('/sessions', sessionsRoutes);

module.exports = app;
