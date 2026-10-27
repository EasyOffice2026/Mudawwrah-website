import assert from 'node:assert/strict';
import { test } from 'node:test';
import { report } from '../src/controllers/cspController.js';

const capture = (body) => {
  const lines = [];
  const quiet = console.warn;
  console.warn = (line) => lines.push(JSON.parse(line));
  let status;
  try {
    report({ body }, { status: (code) => ({ end: () => (status = code) }) });
  } finally {
    console.warn = quiet;
  }
  return { lines, status };
};

test('a report is logged as directive, blocked host and page path only, never full addresses', () => {
  const { lines, status } = capture({
    'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?token=abc', 'document-uri': 'https://www.madawarah.com/r/mdawra?secret=1' },
  });
  assert.equal(status, 204);
  assert.deepEqual(lines, [{ csp: 'script-src-elem', blocked: 'evil.example', page: '/r/mdawra' }]);
});

test('the newer Reporting API list is read too, a few at a time', () => {
  const many = Array.from({ length: 25 }, () => ({ body: { effectiveDirective: 'img-src', blockedURL: 'https://cdn.example/a.png', documentURL: 'https://www.madawarah.com/' } }));
  const { lines } = capture(many);
  assert.equal(lines.length, 10);
  assert.deepEqual(lines[0], { csp: 'img-src', blocked: 'cdn.example', page: '/' });
});
