import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only called by build-dist.sh when HONUA_AWS_INSTALL_PREVIEW=1.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2]);
const partnersPath = resolve(target, 'design-partners.html');
const partners = readFileSync(partnersPath, 'utf8');
const marker = '<div class="h-actions">';
if (!partners.includes(marker)) throw new Error('Design-partner actions not found');
const button = '<a class="h-button h-button-secondary" href="install-aws.html">Install in AWS (preview)</a>';
copyFileSync(resolve(root, 'preview/install-aws.html'), resolve(target, 'install-aws.html'));
writeFileSync(partnersPath, partners.replace(marker, marker + button));
