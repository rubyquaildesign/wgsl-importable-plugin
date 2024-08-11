import plugin from './vite';
import type { ImportablePlugin } from 'importable';
import { resolve } from 'path';
import process from 'node:process';
const vPlugin = plugin();
if (vPlugin.configResolved) {
	(vPlugin as any).configResolved({
		build: {
			sourcemap: false,
		},
	});
}

const testImportModuleSpecifier: ImportablePlugin['testImportModuleSpecifier'] =
	(moduleName) => {
		return moduleName.endsWith('.wgsl');
	};
const testImportAttributes: ImportablePlugin['testImportModuleSpecifier'] = (
	importAttributes,
) => (importAttributes as any).type === 'wgsl';

const generateTypeScriptDefinition: ImportablePlugin['generateTypeScriptDefinition'] =
	(_fileName, _importAttributes, code) => {
		console.error('is this where it fails');
		console.error(JSON.stringify({ code, _fileName, _importAttributes }));
		console.error(JSON.stringify(process.cwd()));
		console.error(JSON.stringify(vPlugin));
		console.error(resolve('./'));
		const result = (vPlugin as any).transform(code, _fileName, {
			cwd: process.env.VSCODE_CWD || resolve('~'),
		});
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
	testImportModuleSpecifier,
};
