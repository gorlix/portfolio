// Genera `public/admin/config.yml` dagli schemi Zod: `pnpm cms:config`.
import { writeFileSync } from 'node:fs';
import { renderCmsConfig } from '../src/lib/cms/config.ts';

writeFileSync(new URL('../public/admin/config.yml', import.meta.url), renderCmsConfig());
