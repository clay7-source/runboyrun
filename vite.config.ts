import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// This configuration ensures that process.env.API_KEY is replaced 
// with the actual environment variable value during the build process.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});
