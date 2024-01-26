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
	],
	plugins: [nodeResolve(), typescriptPlugin()],

	external: [],
});
