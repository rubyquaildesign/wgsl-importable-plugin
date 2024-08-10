"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  generateTypeScriptDefinition: () => generateTypeScriptDefinition,
  testImportAttributes: () => testImportAttributes,
  testImportModuleSpecifier: () => testImportModuleSpecifier
});
module.exports = __toCommonJS(src_exports);

// src/vite.ts
var import_wgsl_linker = require("wgsl-linker");
var msd = __toESM(require("webgpu-utils"), 1);
var import_glob = require("glob");
var import_node_fs = require("fs");
var DEFAULT_EXTENSION = "glsl";
var DEFAULT_SHADERS = Object.freeze(["**/*.wgsl"]);
function wgsl({
  include = DEFAULT_SHADERS,
  exclude = void 0,
  warnDuplicatedImports = true,
  defaultExtension = DEFAULT_EXTENSION,
  compress = false,
  watch = true,
  root = "/"
} = {}) {
  let server, config;
  const prod = process.env.NODE_ENV === "production";
  const filter = /.+\.wgsl/;
  return {
    enforce: "pre",
    name: "vite-plugin-glsl",
    configureServer(devServer) {
      server = devServer;
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    transform(source, shader, ...other) {
      if (!filter.test(shader)) return;
      globalThis.GPUShaderStage = {
        VERTEX: 1,
        FRAGMENT: 2,
        COMPUTE: 4
      };
      const files = (0, import_glob.globSync)([...include, "!node_modules"].filter(Boolean), {
        ignore: exclude,
        absolute: true
      });
      const fileMap = {};
      for (const file of files) {
        fileMap[file] = (0, import_node_fs.readFileSync)(file, "utf8");
      }
      const registary = new import_wgsl_linker.ModuleRegistry({
        wgsl: fileMap
      });
      registary._parseSrc({});
      const resp = registary.findTextModule(shader.replace(/^\//, ""));
      if (!resp) {
        throw Error(`no wgsl file found with the path of ${shader}`);
      }
      const m = registary.link(resp.name);
      const outputShader = m;
      console.log({ outputShader });
      if (!filter.test(shader)) return;
      globalThis.GPUShaderStage = {
        VERTEX: 1,
        FRAGMENT: 2,
        COMPUTE: 4
      };
      const makeShaderDataDefinitions2 = msd.makeShaderDataDefinitions;
      const definitions = makeShaderDataDefinitions2(
        outputShader.replace(/(^|\s)override/g, "const")
      );
      return {
        code: `export const code = \`${outputShader}\`;

export const definitions = ${JSON.stringify(
          definitions
        )};

export default code`,
        map: null,
        data: {
          code: outputShader,
          definitions
        }
      };
    }
  };
}
var vite_default = wgsl;

// src/index.ts
var vPlugin = vite_default();
if (vPlugin.configResolved) {
  vPlugin.configResolved({
    build: {
      sourcemap: false
    }
  });
}
var testImportModuleSpecifier = (moduleName) => {
  return moduleName.endsWith(".wgsl");
};
var testImportAttributes = (importAttributes) => importAttributes.type === "wgsl";
var generateTypeScriptDefinition = (_fileName, _importAttributes, code) => {
  console.error("is this where it fails");
  console.error(JSON.stringify({ code, _fileName }));
  console.error(JSON.stringify(vPlugin));
  const result = vPlugin.transform(code, _fileName);
  console.error(JSON.stringify(result));
  return `
    export const code: string;
    export const definitions: ${JSON.stringify(result.data.definitions)};
    
    export default code;
    `;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateTypeScriptDefinition,
  testImportAttributes,
  testImportModuleSpecifier
});
/**
 * @module vite-plugin-glsl
 * @author Ustym Ukhman <ustym.ukhman@gmail.com>
 * @description Import, inline (and compress) GLSL shader files
 * @version 1.2.1
 * @license MIT
 */
