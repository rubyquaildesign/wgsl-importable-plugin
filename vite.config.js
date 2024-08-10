import { defineConfig } from 'vite';
import glsl from './src/vite.js';

export default defineConfig({
	build: { sourcemap: true },
	plugins: [glsl()],

	server: {
		open: false,
		port: 8080,
	},
});
