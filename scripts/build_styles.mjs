import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const source = 'node_modules/@primer/css/dist/primer.css';
const target = 'assets/vendor/primer.css';
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Copied ${source} -> ${target}`);
