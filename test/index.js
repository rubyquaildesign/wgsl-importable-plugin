import * as WGSL from './wgsl/main.wgsl' with { type: 'b' };

const app = document.getElementById('app');
console.log(WGSL);
app.style.backgroundColor = '#222222';
app.style.fontFamily = 'monospace';
app.style.whiteSpace = 'pre-wrap';

app.style.color = '#bbbbbb';
app.style.padding = '16px';

app.textContent += '----- WGSL: -----\n\n';
app.textContent += WGSL.code;
app.textContent += '\n\n--- Defs ---\n\n'
app.textContent += JSON.stringify(WGSL.definitions,null,1);

console.info(`WGSL Shader Length: ${WGSL.code.length} characters.`);
