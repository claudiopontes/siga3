const fs = require('fs');
const buf = fs.readFileSync('D:/projetos/frontend/public/uploads/siconfi-21601.pdf');
const str = buf.toString('latin1');

// Extrai títulos do outline PDF
const titles = [];
let pos = 0;
while (true) {
  const idx = str.indexOf('/Title (', pos);
  if (idx === -1) break;
  const end = str.indexOf(')', idx + 8);
  if (end === -1) break;
  const title = str.slice(idx + 8, end);
  if (/[a-zA-Z0-9]/.test(title)) titles.push(title);
  pos = idx + 1;
}

console.log('=== SUMÁRIO DO MANUAL ===');
titles.forEach(t => {
  // Decodifica octal PDF
  let decoded = '';
  let i = 0;
  while (i < t.length) {
    const bs = '\\';
    if (t[i] === bs && i + 3 < t.length && /[0-7]/.test(t[i+1])) {
      decoded += String.fromCharCode(parseInt(t.slice(i+1, i+4), 8));
      i += 4;
    } else {
      decoded += t[i];
      i++;
    }
  }
  console.log('  ' + decoded);
});

// Busca todas as URLs localhost para entender a estrutura do sistema
console.log('\n=== URLS DO SISTEMA ===');
const urlPattern = /http:\/\/127\.0\.0\.1:12002\/[^)"\s]+/g;
const urls = [...new Set(str.match(urlPattern) || [])].sort();
urls.forEach(u => console.log('  ' + u));

// Extrai texto de partes específicas do PDF procurando por "DataLake" ou "API"
console.log('\n=== CONTEXTO DataLake/API ===');
const keywords = ['DataLake', 'datalake', 'swagger', 'Swagger', 'apidatalake', 'data lake'];
for (const kw of keywords) {
  let p = 0;
  while (true) {
    const i = str.toLowerCase().indexOf(kw.toLowerCase(), p);
    if (i === -1) break;
    const ctx = str.slice(Math.max(0, i-150), i+300).replace(/[^\x20-\x7E\n\t]/g, '.');
    console.log('\n[' + kw + ' pos=' + i + ']\n' + ctx);
    p = i + 1;
    if (p - (i) > 50000) break; // evita loop
  }
}
