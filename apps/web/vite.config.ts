import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Mirrors the nginx setup: the SPA calls /api/* on its own origin and the prefix is stripped
    // before reaching the API, so the HttpOnly auth cookie stays first-party and CORS never applies.
    // `vite preview` reuses this proxy.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Framework and library code changes far less often than app code; separate hashed chunks
        // stay in the browser cache (served `immutable`) across application deploys.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              priority: 2,
            },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-support/setup.ts'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [...coverageConfigDefaults.exclude, 'src/test-support/**', 'src/main.tsx'],
      // Enforced by `npm run test:coverage`: a drop below these fails the run.
      thresholds: { statements: 95, branches: 92, functions: 95, lines: 95 },
    },
  },
});
