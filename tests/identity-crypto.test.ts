import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptKycValue, encryptKycValue, hashDocumentNumber, isKycEncryptionConfigured } from '../server/services/identityCrypto.ts';

test('KYC payload encryption can be decrypted with the configured key', () => {
  const previousKey = process.env.KYC_ENCRYPTION_KEY;
  process.env.KYC_ENCRYPTION_KEY = 'test-only-key-with-more-than-32-characters';
  try {
    const payload = JSON.stringify({ first_name: 'Awa', document_number: 'CI 1234 5678' });
    const encrypted = encryptKycValue(payload);
    assert.notEqual(encrypted, payload);
    assert.equal(decryptKycValue(encrypted), payload);
  } finally {
    if (previousKey === undefined) delete process.env.KYC_ENCRYPTION_KEY;
    else process.env.KYC_ENCRYPTION_KEY = previousKey;
  }
});

test('document uniqueness hashes are deterministic after normalization', () => {
  const previousKey = process.env.KYC_ENCRYPTION_KEY;
  process.env.KYC_ENCRYPTION_KEY = 'test-only-key-with-more-than-32-characters';
  try {
    assert.equal(hashDocumentNumber('ci 1234-5678'), hashDocumentNumber('CI12345678'));
  } finally {
    if (previousKey === undefined) delete process.env.KYC_ENCRYPTION_KEY;
    else process.env.KYC_ENCRYPTION_KEY = previousKey;
  }
});

test('tampered encrypted KYC payloads are rejected', () => {
  const previousKey = process.env.KYC_ENCRYPTION_KEY;
  process.env.KYC_ENCRYPTION_KEY = 'test-only-key-with-more-than-32-characters';
  try {
    const encrypted = encryptKycValue('document privé');
    assert.throws(() => decryptKycValue(`${encrypted.slice(0, -2)}00`));
  } finally {
    if (previousKey === undefined) delete process.env.KYC_ENCRYPTION_KEY;
    else process.env.KYC_ENCRYPTION_KEY = previousKey;
  }
});

test('production KYC encryption refuses to run without a configured key', () => {
  const previousKey = process.env.KYC_ENCRYPTION_KEY;
  const previousEnvironment = process.env.NODE_ENV;
  delete process.env.KYC_ENCRYPTION_KEY;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(isKycEncryptionConfigured(), false);
    assert.throws(() => encryptKycValue('identity data'));
  } finally {
    if (previousKey === undefined) delete process.env.KYC_ENCRYPTION_KEY;
    else process.env.KYC_ENCRYPTION_KEY = previousKey;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
