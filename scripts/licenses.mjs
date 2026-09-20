import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Generate notices from installed, locked production dependencies.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const runtime = Object.entries(lock.packages).filter(([path, entry]) => path && !entry.dev);
const sections = ['# Third-party notices\n\nRequestDock is MIT licensed. These runtime packages are distributed with, or bundled into, the application. Each retains its own copyright and license. Regenerate with `npm run licenses` after `npm ci`. Build and test tool metadata is recorded in package-lock.json. Container base-image components retain the notices supplied in the base image.\n'];
for (const [path, entry] of runtime.sort(([a], [b]) => a.localeCompare(b))) {
  const directory = resolve(path);
  const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const names = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  if (!names.length) throw new Error(`Missing license text for ${pkg.name}`);
  sections.push(`## ${pkg.name} ${entry.version}\n\nDeclared license: ${pkg.license ?? entry.license ?? 'See text below'}.\n`);
  for (const name of names) sections.push(`### ${name}\n\n\`\`\`text\n${(await readFile(resolve(directory, name), 'utf8')).trim()}\n\`\`\`\n`);
}
await writeFile('THIRD_PARTY_NOTICES.md', sections.join('\n'));
console.log(`Wrote notices for ${runtime.length} production dependencies.`);
