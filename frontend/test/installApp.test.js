import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, shortName } from '../api/_manifest.js';
import { isInstalled, needsShareHint } from '../src/lib/installApp.js';

const MDAWRA = { slug: 'mdawra', nameEn: 'Modawarah Restaurant Company', brandColor: '#B00020', taglineEn: 'Kuwaiti · Breakfast' };

test('each restaurant gets its own app: name, address to open, colour', () => {
  const manifest = buildManifest(MDAWRA);
  assert.equal(manifest.name, 'Modawarah Restaurant Company');
  assert.equal(manifest.short_name, 'Modawarah');
  assert.equal(manifest.start_url, '/r/mdawra?source=app');
  assert.equal(manifest.id, '/r/mdawra');
  assert.equal(manifest.theme_color, '#B00020');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.description, 'Kuwaiti · Breakfast');
  const khobzt = buildManifest({ slug: 'khobzt-marie', nameEn: 'Khobzt Marie', brandColor: '#0B6E4F' });
  assert.deepEqual([khobzt.start_url, khobzt.theme_color, khobzt.short_name], ['/r/khobzt-marie?source=app', '#0B6E4F', 'Khobzt Marie']);
});

test('it has what a browser needs to offer "Install": both icon sizes, a maskable one, a name and a start address', () => {
  const manifest = buildManifest(MDAWRA);
  const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
  assert.deepEqual(sizes, ['192x192:any', '512x512:any', '512x512:maskable']);
  assert.ok(manifest.icons.every((icon) => icon.type === 'image/png' && icon.src.startsWith('/app-icon/')));
  assert.ok(manifest.name && manifest.start_url && manifest.scope === '/');
});

test('with no restaurant (the platform address) there is still a valid, generic app', () => {
  const manifest = buildManifest(null);
  assert.equal(manifest.name, 'Order online');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.theme_color, '#B00020');
});

test('an invalid brand colour falls back, and the short name is cut at a word', () => {
  assert.equal(buildManifest({ slug: 'x', nameEn: 'X', brandColor: 'red' }).theme_color, '#B00020');
  assert.equal(shortName('Burger House Kuwait'), 'Burger House');
  assert.equal(shortName('Al-Mubarakiyyah-Restaurant'), 'Al-Mubarakiy');
  assert.equal(shortName('Cafe Mocha'), 'Cafe Mocha');
  assert.equal(shortName(''), '');
});

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

test('the Share-menu instruction is only for Safari on iPhone and iPad', () => {
  assert.equal(needsShareHint(IPHONE_SAFARI, 5), true);
  assert.equal(needsShareHint(IPAD_SAFARI, 5), true, 'an iPad that presents itself as a Mac');
  assert.equal(needsShareHint(IPHONE_CHROME, 5), false, 'Chrome on iPhone cannot install');
  assert.equal(needsShareHint(ANDROID_CHROME, 5), false);
  assert.equal(needsShareHint(WINDOWS_CHROME, 0), false);
  assert.equal(needsShareHint(IPAD_SAFARI, 0), false, 'a real Mac has no touch screen');
  assert.equal(needsShareHint(), false);
});

test('an installed app is recognised by its display mode, or by iPhone\'s own flag', () => {
  assert.equal(isInstalled({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(isInstalled({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
  assert.equal(isInstalled({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
  assert.equal(isInstalled({ navigator: {} }), false);
});
