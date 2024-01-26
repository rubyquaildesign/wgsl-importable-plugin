import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/vite.ts'],
	format: ['esm', 'cjs'],
	minify: false,
	clean: true,
	dts: true,
	target: 'node18',
});
