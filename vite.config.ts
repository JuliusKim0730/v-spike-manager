import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file (for sharing a playable preview).
// `--mode cdn` loads React from esm.sh through an import map, so the hosted build stays small.
const REACT = 'https://esm.sh/react@18.3.1';
const IMPORTS = {
  react: REACT,
  'react/jsx-runtime': `${REACT}/jsx-runtime`,
  'react-dom/client': 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1',
};
const importMap = (): Plugin => ({
  name: 'import-map',
  transformIndexHtml: html => html.replace('<title>', `<script type="importmap">${JSON.stringify({ imports: IMPORTS })}</script>\n    <title>`),
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : []), ...(mode === 'cdn' ? [importMap()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'cdn' ? 'dist-cdn' : 'dist',
    target: 'es2020',
    rollupOptions: mode === 'cdn' ? { external: Object.keys(IMPORTS) } : {},
  },
}));
