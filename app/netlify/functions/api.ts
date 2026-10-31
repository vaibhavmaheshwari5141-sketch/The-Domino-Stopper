// Netlify Function serving /api/* (netlify.toml rewrites /api/* to /.netlify/functions/api/*).
// Production always reads Databricks; set DATABRICKS_* in Site settings -> Environment variables, never in git.

import { createApiHandler } from '../../server/app.ts';
import { readConfig } from '../../server/config.ts';
import { createDatabricksSource } from '../../server/sources/databricks.ts';

const settings = readConfig(process.env);
const handler = createApiHandler(settings, createDatabricksSource(settings.databricks));

export default (req: Request): Promise<Response> => handler(req);
