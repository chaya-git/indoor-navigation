import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // Generates trusted local HTTPS so mobile Chrome & Safari unlock DeviceMotion & DeviceOrientation
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: true
  }
});
