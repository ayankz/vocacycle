const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Load the actual TypeScript modules with only platform boundaries stubbed.
module.exports = function createLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    function resolve(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        const file = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
        if (file) return load(file);
      }
      return require(name);
    }
    vm.runInNewContext(source, {
      module, exports: module.exports, require: resolve, URL, Error, setTimeout, clearTimeout,
      process: { env: { EXPO_PUBLIC_API_URL: 'http://192.168.1.10:5126' } }, ...globals,
    }, { filename });
    return module.exports;
  }
  return load;
};
