import path from 'path';
import * as url from 'url';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export default {
  input: path.join(__dirname, '../public/main.js'),
  output: {
    file: path.join(__dirname, '../public/bundle.js'),
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    babel({
      babelHelpers: 'bundled',
      exclude: ['/node_modules/**'],
    }),
  ],
};