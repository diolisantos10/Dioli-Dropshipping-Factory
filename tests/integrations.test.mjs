import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptIntegrationSecrets,
  encryptIntegrationSecrets,
  integrationStatusForSecrets,
  serializePublicIntegration,
} from '../src/lib/integration-security.ts';
import { isRegisteredProvider, providerKeys } from '../src/lib/providers/registry.ts';

const originalKey = process.env.DDF_CREDENTIALS_KEY;

test.beforeEach(() => {
  process.env.DDF_CREDENTIALS_KEY = 'test-only-credential-key';
});

test.after(() => {
  if (originalKey === undefined) delete process.env.DDF_CREDENTIALS_KEY;
  else process.env.DDF_CREDENTIALS_KEY = originalKey;
});

test('cofre cifra e decifra credenciais sem texto legível', () => {
  const secrets = { apiKey: 'segredo-super-sensivel', token: 'token-123' };
  const encrypted = encryptIntegrationSecrets(secrets);
  assert.notEqual(encrypted, JSON.stringify(secrets));
  assert.equal(encrypted.includes(secrets.apiKey), false);
  assert.deepEqual(decryptIntegrationSecrets(encrypted), secrets);
});

test('cofre rejeita payload adulterado e chave diferente', () => {
  const encrypted = encryptIntegrationSecrets({ apiKey: 'secret' });
  const raw = Buffer.from(encrypted, 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptIntegrationSecrets(raw.toString('base64')));

  process.env.DDF_CREDENTIALS_KEY = 'another-key';
  assert.throws(() => decryptIntegrationSecrets(encrypted));
});

test('serialização pública nunca expõe segredo cifrado', () => {
  const output = serializePublicIntegration({
    id: 'int-1', kind: 'SUPPLIER', provider_key: 'aliexpress', name: 'AliExpress',
    environment: 'SANDBOX', status: 'CONFIGURED', config: { region: 'BR' },
    encrypted_secrets: 'ciphertext-must-not-leak', secret_fields: ['apiKey'],
    capabilities: ['catalog'], last_tested_at: null, last_error: null,
    created_at: '2026-01-01', updated_at: '2026-01-02',
  });
  assert.equal('encrypted_secrets' in output, false);
  assert.equal(JSON.stringify(output).includes('ciphertext-must-not-leak'), false);
  assert.deepEqual(output.secretFields, ['apiKey']);
  assert.equal(output.providerKey, 'aliexpress');
});

test('status inicial reflete presença de credencial utilizável', () => {
  assert.equal(integrationStatusForSecrets({}), 'DRAFT');
  assert.equal(integrationStatusForSecrets({ apiKey: '' }), 'DRAFT');
  assert.equal(integrationStatusForSecrets({ apiKey: 'configured' }), 'CONFIGURED');
});

test('registro de provedores reconhece somente adapters disponíveis', () => {
  assert.deepEqual(providerKeys, ['aliexpress', 'shopify']);
  assert.equal(isRegisteredProvider('shopify'), true);
  assert.equal(isRegisteredProvider('aliexpress'), true);
  assert.equal(isRegisteredProvider('unknown-provider'), false);
});
