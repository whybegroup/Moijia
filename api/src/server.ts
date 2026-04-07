import path from 'path';
import { config as loadEnv } from 'dotenv';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { RegisterRoutes } from './generated/routes';
import { registerLocalUploadRoutes } from './services/LocalUploadService';
import { apiReference } from '@scalar/express-api-reference';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
registerLocalUploadRoutes(app);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Register tsoa routes
RegisterRoutes(app);

// API Documentation
const openapiPath = path.join(__dirname, 'generated', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const openapiContent = fs.readFileSync(openapiPath, 'utf8');
  const openapiSpec = yaml.load(openapiContent);

  app.use(
    '/docs',
    apiReference({
      spec: {
        content: openapiSpec,
      },
      theme: 'purple',
      layout: 'modern',
    })
  );
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API docs available at http://localhost:${PORT}/docs`);
  console.log(`💚 Health check at http://localhost:${PORT}/health`);
});

export default app;
