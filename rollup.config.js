import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from 'rollup-plugin-ts';
import { defineConfig } from 'rollup';

export default defineConfig({
	input: ['src/vite.ts'],
	output: [
		{
			file: 'output/vite.cjs',
			format: 'cjs',
		},
		{
			file: 'output/vite.mjs',
			format: 'esm',
		},
	],
	plugins: [nodeResolve(), typescriptPlugin()],

	external: [],
});
