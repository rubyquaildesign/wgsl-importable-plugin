import {
  vite_default
} from "./chunk-FSDISA6M.js";

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
export {
  generateTypeScriptDefinition,
  testImportAttributes,
  testImportModuleSpecifier
};
