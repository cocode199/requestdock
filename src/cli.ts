#!/usr/bin/env node
import { Command, CommanderError, Option } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCollection } from './core/schema.js';
import { runCollection } from './core/engine.js';
import { compareRuns } from './core/diff.js';
import { loadPlugins } from './core/plugins.js';
import { demoCollection } from './demo.js';
import { importCollection } from './importer.js';
import { startServer } from './server.js';
import type { RunResult } from './shared/types.js';

const readJson = async (path: string) => JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
const list = (value: string, previous: string[]) => [...previous, value];
const save = (path: string, value: unknown, overwrite = false) => writeFile(resolve(path), JSON.stringify(value, null, 2) + '\n', { flag: overwrite ? 'w' : 'wx', mode: 0o600 });
function stringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.values(input).some(v => typeof v !== 'string')) throw new Error('Environment file must be a JSON object of string values');
  return input as Record<string, string>;
}
function runInput(input: unknown): RunResult {
  if (!input || typeof input !== 'object' || !Array.isArray((input as RunResult).results)) throw new Error('Expected a RequestDock run report');
  for (const result of (input as RunResult).results) if (typeof result?.requestId !== 'string' || typeof result.status !== 'number' || typeof result.body !== 'string' || (result.error !== undefined && typeof result.error !== 'string')) throw new Error('Invalid run result');
  return input as RunResult;
}
export function makeProgram() {
  const program = new Command().name('requestdock').version('0.1.0').description('Local API requests, declarative checks, and response comparisons').exitOverride();
  program.command('init').argument('[file]', 'Collection file', 'collection.json').option('--force', 'Overwrite an existing file').action(async (file, options) => {
    await save(file, demoCollection(), options.force); console.log(`Created ${file}. Start the local demo with requestdock serve.`);
  });
  program.command('run').argument('<file>', 'Collection JSON').option('--env-file <file>', 'Runtime variables JSON').option('--env <KEY=VALUE>', 'Override a runtime variable (repeatable)', list, []).option('--plugin <path>', 'Load a trusted local .mjs assertion plugin (repeatable)', list, []).option('--json', 'Print JSON report').option('--output <file>', 'Save JSON report').option('--force', 'Overwrite report file').action(async (file, options) => {
    const variables = options.envFile ? stringMap(await readJson(options.envFile)) : {};
    for (const variable of options.env as string[]) {
      const split = variable.indexOf('=');
      if (split < 1) throw new Error('--env requires KEY=VALUE');
      Object.defineProperty(variables, variable.slice(0, split), { value: variable.slice(split + 1), enumerable: true, configurable: true, writable: true });
    }
    const result = await runCollection(parseCollection(await readJson(file)), { variables, plugins: await loadPlugins(options.plugin) });
    if (options.output) await save(options.output, result, options.force);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const item of result.results) {
        console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.method} ${item.name} · ${item.status || 'ERR'} · ${item.durationMs.toFixed(0)} ms`);
        if (item.error) console.log(`  ${item.error}`);
        for (const check of item.checks) console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.message}`);
      }
      console.log(`${result.results.filter(r => r.passed).length}/${result.results.length} requests passed`);
    }
    if (!result.passed) process.exitCode = 1;
  });
  program.command('compare').argument('<baseline>').argument('<current>').option('--ignore <path>', 'Ignore a response JSON body path (repeatable)', list, []).action(async (baseline, current, options) => {
    const diff = compareRuns(runInput(await readJson(baseline)), runInput(await readJson(current)), options.ignore);
    console.log(JSON.stringify(diff, null, 2));
    if (!diff.equal) process.exitCode = 1;
  });
  program.command('import').argument('<source-file>', 'Postman v2.1 or RequestDock v1 JSON').requiredOption('--output <file>', 'Write a RequestDock collection').option('--force', 'Overwrite existing output').action(async (file, options) => {
    const result = importCollection(await readJson(file));
    await save(options.output, result.collection, options.force);
    for (const warning of result.warnings) console.error(`Warning: ${warning}`);
    console.log(`Imported ${result.collection.requests.length} requests into ${options.output}`);
  });
  program.command('serve').option('--host <host>', 'Bind address', '127.0.0.1').addOption(new Option('--port <port>', 'Listen port').default('4310').env('PORT')).addOption(new Option('--data <directory>', 'Workspace directory').default('.requestdock').env('REQUESTDOCK_DATA')).option('--plugin <path>', 'Load a trusted local .mjs plugin (repeatable)', list, []).action(async options => {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer between 1 and 65535');
    const uiDirectory = fileURLToPath(new URL('../dist/ui/', import.meta.url));
    const { server } = await startServer({ host: options.host, port, data: options.data, token: process.env.REQUESTDOCK_TOKEN, plugins: await loadPlugins(options.plugin), uiDirectory });
    console.log(`RequestDock listening on http://${options.host.includes(':') ? `[${options.host}]` : options.host}:${port}`);
    const stop = () => { server.close(); server.closeIdleConnections(); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  });
  return program;
}

makeProgram().parseAsync().catch(error => {
  if (error instanceof CommanderError) { process.exitCode = error.exitCode === 0 ? 0 : 2; return; }
  console.error(`Error: ${error instanceof Error ? error.message : error}`); process.exitCode = 2;
});
