import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RequestdockPlugin } from '../shared/types.js';

export function validatePlugin(value: unknown): asserts value is RequestdockPlugin {
  if (value === null || typeof value !== 'object') throw new Error('Plugin must default-export an object');
  const plugin = value as Partial<RequestdockPlugin>;
  if (typeof plugin.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(plugin.name)) throw new Error('Plugin name must be 1–128 letters, numbers, dots, underscores, or hyphens');
  if (typeof plugin.version !== 'string' || !plugin.version.trim() || plugin.version.length > 128) throw new Error(`Plugin ${plugin.name} must declare a version`);
  if (typeof plugin.assert !== 'function') throw new Error(`Plugin ${plugin.name} must expose assert(context)`);
}

/** Only explicit local .mjs files are executable. Collections never load code. */
export async function loadPlugins(paths: string[]): Promise<RequestdockPlugin[]> {
  const plugins: RequestdockPlugin[] = [];
  const names = new Set<string>();
  for (const path of paths) {
    if (!path.toLowerCase().endsWith('.mjs')) throw new Error('Plugins must be explicit local .mjs file paths');
    const module = await import(pathToFileURL(resolve(path)).href);
    const plugin: unknown = module.default;
    validatePlugin(plugin);
    if (names.has(plugin.name)) throw new Error(`Duplicate plugin name: ${plugin.name}`);
    names.add(plugin.name);
    plugins.push(plugin);
  }
  return plugins;
}
