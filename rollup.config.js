import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from 'rollup-plugin-ts';
import { defineConfig } from 'rollup';
import requireJS from '@rollup/plugin-commonjs';
export default defineConfig([
	{
		input: 'src/index.ts',
		output: [
			{
				format: 'esm',
				entryFileNames: 'index.mjs',
				dir: 'output',
			},
			{
				format: 'commonjs',
				entryFileNames: 'index.cjs',
				dir: 'output',
			},
		],
		plugins: [
			nodeResolve(),
			typescriptPlugin({ tsconfig: './tsconfig.json' }),
			requireJS(),
		],

		external: [],
	},
	{
		input: 'src/vite.ts',
		output: [
			{
				format: 'esm',
				entryFileNames: 'vite.mjs',
				dir: 'output',
			},
			{
				format: 'commonjs',
				entryFileNames: 'vite.cjs',
				dir: 'output',
			},
		],
		plugins: [
			nodeResolve(),
			typescriptPlugin({ tsconfig: './tsconfig.json' }),
			requireJS(),
		],

		external: [],
	},
]);
