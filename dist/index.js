// src/index.ts
import plugin from "@rupertofly/vite-plugin-glsl";
var vPlugin = plugin();
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
var generateTypescriptDefinition = (_fileName, _importAttributes, code) => {
  const result = vPlugin.transform(code, _fileName);
  return `
    export code: string;
    export definitions: Object as ${JSON.stringify(result.data.definitions)};
    
    export default code;
    `;
};
export {
  generateTypescriptDefinition,
  testImportAttributes,
  testImportModuleSpecifier
};
