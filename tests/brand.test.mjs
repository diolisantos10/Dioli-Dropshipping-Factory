import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertVaultRule, VAULT_RULE_MESSAGE } from '../src/lib/integration-security.ts';

const css = readFileSync('src/app/globals.css', 'utf8');
const files = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; });
const sources = files('src').filter((path) => /\.(tsx?|css)$/.test(path)).map((path) => [path, readFileSync(path, 'utf8')]);

test('brand book: as três cores oficiais e a tipografia estão definidas num lugar só', () => {
  assert.match(css, /--brand-grafite:\s*#171C20/i);
  assert.match(css, /--brand-branco:\s*#F4F6F3/i);
  assert.match(css, /--brand-lima:\s*#C4F25A/i);
  assert.match(css, /font-family: "DejaVu Sans"/);
  for (const weight of [400, 700]) assert.ok(existsSync(`public/fonts/dejavu-sans-${weight}.woff2`), `fonte ${weight} embutida`);
});

test('brand book: nenhuma cor da identidade antiga sobra nas telas', () => {
  const legacy = /#(ff5b2e|17191d|f4f1eb|fbfaf7|ddd9d1|696d75)\b/i;
  const offenders = sources.filter(([, text]) => legacy.test(text)).map(([path]) => path);
  assert.deepEqual(offenders, []);
});

test('brand book: nada de promessa não comprovada no topo (demonstração/dados simulados)', () => {
  const shell = readFileSync('src/components/app-shell.tsx', 'utf8');
  assert.doesNotMatch(shell, /Dados simulados|Demonstração|Sem operações externas/);
  assert.match(shell, /Inteligência em operação\./);
  assert.match(shell, /Santioh · Dilee · Dilix · Queise/);
});

test('regra do cofre: produto não cadastra chave de IA nem mostra opção OpenAI', () => {
  assert.throws(() => assertVaultRule('PROVIDER'), new RegExp(VAULT_RULE_MESSAGE.slice(0, 20)));
  assert.doesNotThrow(() => assertVaultRule('SUPPLIER'));
  assert.doesNotThrow(() => assertVaultRule('CHANNEL'));
  const connectors = readFileSync('src/components/connectors-workspace.tsx', 'utf8');
  assert.doesNotMatch(connectors, /key:'openai'|kind:'PROVIDER'/);
});
