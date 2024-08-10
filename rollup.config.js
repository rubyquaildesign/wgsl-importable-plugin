import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from 'rollup-plugin-ts';
import { defineConfig } from 'rollup';
import requireJS from '@rollup/plugin-commonjs';
export default defineConfig({
	input: ['src/index.ts'],
	output: [
		{
			file: 'output/index.cjs',
			format: 'cjs',
		},
		{
			file: 'output/index.mjs',
			format: 'esm',
		},
	],
	plugins: [
		nodeResolve(),
		typescriptPlugin({ tsconfig: './tsconfig.json' }),
		requireJS(),
	],

	external: [],
});
