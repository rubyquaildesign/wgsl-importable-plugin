import plugin from '@rupertofly/vite-plugin-glsl';
import type { ImportablePlugin } from 'importable';
const vPlugin = plugin();
if (vPlugin.configResolved) {
	(vPlugin as any).configResolved({
		build: {
			sourcemap: false,
		},
	});
}

export const testImportModuleSpecifier: ImportablePlugin['testImportModuleSpecifier'] =
	(moduleName) => {
		return moduleName.endsWith('.wgsl');
	};
export const testImportAttributes: ImportablePlugin['testImportAttributes'] = (
	importAttributes,
) => importAttributes.type === 'wgsl';

export const generateTypescriptDefinition: ImportablePlugin['generateTypeScriptDefinition'] =
	(_fileName, _importAttributes, code) => {
		const result = (vPlugin as any).transform(code, _fileName);
		return `
    export code: string;
    export definitions: Object as ${JSON.stringify(result.data.definitions)};
    
    export default code;
    `;
	};
