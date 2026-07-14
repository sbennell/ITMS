import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

// Root package.json is the single source of truth for the app version
// (see VERSION_HISTORY.md / README.md, which are bumped alongside it).
const rootPackageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
