import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Connect, type Plugin, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

type ApiHandler = (req: Request) => Promise<Response>;
type DevModule = { createDevHandler: (env: Record<string, string | undefined>, root?: string) => Promise<ApiHandler> };

/**
 * Serves /api/* from server/ inside the Vite server, so `npm run dev` runs the React app and the API together.
 * Server-only variables (DATABRICKS_TOKEN, ...) are read from .env here and never reach the browser bundle:
 * Vite only exposes VITE_* variables to client code.
 */
function api(): Plugin {
  function middleware(getHandler: () => Promise<ApiHandler>): Connect.NextHandleFunction {
    return (req: IncomingMessage, res: ServerResponse, next) => {
      if (!req.url?.startsWith('/api/') && req.url !== '/api') return next();
      void (async () => {
        try {
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const response = await (await getHandler())(
            new Request(new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`), { method: req.method, headers }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      })();
    };
  }

  return {
    name: 'domino-stopper-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');   // .env plus shell variables (shell wins)
      // Reloaded through Vite, so edits under server/ apply on the next request
      let current: { mod: DevModule; handler: Promise<ApiHandler> } | null = null;
      server.middlewares.use(
        middleware(async () => {
          const mod = (await server.ssrLoadModule('/server/dev.ts')) as DevModule;
          if (current?.mod !== mod) current = { mod, handler: mod.createDevHandler(env, server.config.root) };
          return current.handler;
        }),
      );
    },
    configurePreviewServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      // Plain Node import of the TypeScript source (Node 22.18+ strips types natively)
      const handler = import(pathToFileURL(resolve(server.config.root, 'server/dev.ts')).href).then((mod: DevModule) =>
        mod.createDevHandler(env, server.config.root),
      );
      server.middlewares.use(middleware(() => handler));
    },
  };
}

export default defineConfig({
  plugins: [react(), api()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      // Libraries in their own files: smaller app bundle, and browsers keep them cached between releases
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'], charts: ['recharts'] } },
    },
  },
});
