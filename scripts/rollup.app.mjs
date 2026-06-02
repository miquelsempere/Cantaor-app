import path from 'path';
import * as url from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';
import replace from '@rollup/plugin-replace';

// Load environment variables from .env file
dotenv.config();

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

// Inject env vars into confirm.html at build time
function injectConfirmHtml() {
  return {
    name: 'inject-confirm-html',
    writeBundle() {
      const confirmPath = path.join(__dirname, '../public/confirm.html');
      let html = fs.readFileSync(confirmPath, 'utf8');
      html = html
        .replace('%%SUPABASE_URL%%', process.env.VITE_SUPABASE_URL || '')
        .replace('%%SUPABASE_ANON_KEY%%', process.env.VITE_SUPABASE_ANON_KEY || '');
      // Write to a dist copy so the source template is preserved
      const distPath = path.join(__dirname, '../public/confirm.html');
      fs.writeFileSync(distPath, html, 'utf8');
    },
  };
}

export default {
  input: path.join(__dirname, '../public/main.js'),
  output: {
    file: path.join(__dirname, '../public/bundle.js'),
    format: 'es',
    sourcemap: true,
  },
  onwarn(warning, warn) {
    // Suppress sourcemap warnings from node_modules
    if (warning.code === 'SOURCEMAP_ERROR' && warning.loc && warning.loc.file.includes('node_modules')) {
      return;
    }
    warn(warning);
  },
  plugins: [
    replace({
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
      preventAssignment: true,
    }),
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    babel({
      babelHelpers: 'bundled',
      exclude: ['/node_modules/**'],
    }),
    injectConfirmHtml(),
  ],
};