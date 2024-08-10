import { ImportablePlugin } from 'importable';

declare const testImportModuleSpecifier: ImportablePlugin['testImportModuleSpecifier'];
declare const testImportAttributes: ImportablePlugin['testImportModuleSpecifier'];
declare const generateTypeScriptDefinition: ImportablePlugin['generateTypeScriptDefinition'];

export { generateTypeScriptDefinition, testImportAttributes, testImportModuleSpecifier };
