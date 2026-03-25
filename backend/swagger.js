const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const YAML = require('yaml');
const path = require('path');

const setupSwagger = (app) => {
  const file = fs.readFileSync(path.join(__dirname, 'openapi.yml'), 'utf8');
  const swaggerDocument = YAML.parse(file);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
};

module.exports = setupSwagger;

