import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve the Tailwind config by absolute path so it's found regardless of the
// current working directory the dev server is launched from.
const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(dir, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
