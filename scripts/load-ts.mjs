import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

export function tsLoader(globals = {}) {
  const cache = new Map()
  function load(filename) {
    filename = resolve(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const loadedModule = { exports: {} }
    cache.set(filename, loadedModule)
    const require = createRequire(filename)
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = spec => {
      if (spec.startsWith('.')) {
        const base = resolve(dirname(filename), spec)
        if (existsSync(base + '.ts')) return load(base + '.ts')
      }
      return require(spec)
    }
    runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: localRequire,
      Buffer, URL, TextEncoder, AbortSignal, Response, process: typeof process === 'undefined' ? { env: {} } : process, console,
      setTimeout, clearTimeout, fetch: (...args) => globalThis.fetch(...args), ...globals }, { filename })
    return loadedModule.exports
  }
  return load
}
