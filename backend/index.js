const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ message: "Healthy Boxing API Running"});
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
