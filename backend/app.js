const express = require('express');
const authRoutes = require('./routes/auth.routes');
const uploadRoutes = require('./routes/upload.routes');
const sessionsRoutes = require('./routes/sessions.routes');
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
app.use('/upload', uploadRoutes);
app.use('/sessions', sessionsRoutes);

module.exports = app;
