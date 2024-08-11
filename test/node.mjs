import { globSync } from 'glob';
console.log(
	globSync(['./**/*slint*'], {
		dot: true,
		ignore: ['node_modules/**/*rc'],
	}),
);
