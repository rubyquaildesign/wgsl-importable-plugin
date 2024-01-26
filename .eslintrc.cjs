const config = require('eslint-config-standard-typescript-prettier/eslint.js');

module.exports = {
	...config,
	parserOptions: { project: './tsconfig.json' },
	rules: {
		...config.rules,
	},
};
