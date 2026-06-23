/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  console.log('VITE LOAD ENV:', {
    root: process.cwd(),
    mode,
    VITE_STABILITY_KEY: !!env.VITE_STABILITY_KEY,
    VITE_OPENAI_KEY: !!env.VITE_OPENAI_KEY,
    VITE_REMOVE_BG_KEY: !!env.VITE_REMOVE_BG_KEY,
  });

  return {
    plugins: [
      figmaAssetResolver(),
      tailwindcss(),
      react(),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      proxy: {
        '/api-proxy/stability': {
          target: 'https://api.stability.ai',
          changeOrigin: true,
          rewrite: (p) => p.replace('/api-proxy/stability', ''),
        },
        '/api-proxy/replicate': {
          target: 'https://api.replicate.com',
          changeOrigin: true,
          rewrite: (p) => p.replace('/api-proxy/replicate', ''),
        },
        '/api-proxy/removebg': {
          target: 'https://api.remove.bg',
          changeOrigin: true,
          rewrite: (p) => p.replace('/api-proxy/removebg', ''),
        },
      },
    },
    css: {
      // Disable external postcss.config file — handled by @tailwindcss/vite plugin
      postcss: {},
    },
    define: {
      'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify('pk_live_51TXNn7FjNX0bk5AePD99ngwf7MXcb2bbVMBwojgHVhE1yXqqhE94Vcv2EB0uo6P4jQwd7vB9cqRB1qMJAwYIJNtA00JMD9tyuv'),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        reporter: ['text', 'json', 'html'],
      },
    },
  };
});