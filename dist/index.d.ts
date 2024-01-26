import { ImportablePlugin } from 'importable';

declare const testImportModuleSpecifier: ImportablePlugin['testImportModuleSpecifier'];
declare const testImportAttributes: ImportablePlugin['testImportAttributes'];
declare const generateTypescriptDefinition: ImportablePlugin['generateTypeScriptDefinition'];

export { generateTypescriptDefinition, testImportAttributes, testImportModuleSpecifier };
