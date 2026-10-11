import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  // rehype-katex must share one KaTeX with the chemistry extension (pre-bundling it inlines a private copy).
  optimizeDeps: { include: ['katex', 'katex/contrib/mhchem'], exclude: ['rehype-katex'] },
});
