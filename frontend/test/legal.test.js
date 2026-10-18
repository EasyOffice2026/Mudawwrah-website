import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legalFor, PAGE_ORDER, PAGE_PATH, pageIn } from '../src/customer/legal/index.js';
import { richParts } from '../src/customer/legal/rich.js';

const mdawra = legalFor('mdawra');
const PHONE = '22008080';

test('Modawarah has all three pages in both languages', () => {
  assert.deepEqual(PAGE_ORDER, ['about', 'terms', 'refund']);
  for (const page of PAGE_ORDER) {
    for (const lang of ['en', 'ar']) {
      const view = mdawra[page][lang];
      assert.ok(view.title, `${page}/${lang} has a title`);
      assert.ok(view.blocks.length > 0, `${page}/${lang} has content`);
      assert.ok(view.blocks.every((b) => (b.h ?? b.p)?.trim()), `${page}/${lang} has no empty blocks`);
    }
  }
});

test('English and Arabic say the same thing in the same shape', () => {
  for (const page of PAGE_ORDER) {
    const shape = (lang) => mdawra[page][lang].blocks.map((b) => ('h' in b ? 'h' : 'p')).join('');
    assert.equal(shape('en'), shape('ar'), `${page}: same headings and paragraphs in the same order`);
  }
  const numbers = (lang) => mdawra.terms[lang].blocks.filter((b) => b.h).map((b) => b.h.split(' ')[0]);
  assert.deepEqual(numbers('en'), ['1.', '2.', '3.', '4.', '5.', '6.', '7.']);
  assert.deepEqual(numbers('ar'), numbers('en'));
  assert.equal(mdawra.refund.en.blocks.filter((b) => b.h).length, 5);
});

test("the client's drafting notes are not published", () => {
  const everything = JSON.stringify(mdawra);
  assert.doesNotMatch(everything, /Drafting references|WIPO|Tamimi|consumer-protection framework/i);
});

test('there is one support number, and it is the one that becomes a call link', () => {
  const numbers = new Set(JSON.stringify(mdawra).match(/\b\d{8}\b/g));
  assert.deepEqual([...numbers], [PHONE]);
  assert.equal(mdawra.contact.phone, PHONE);
  assert.equal(mdawra.contact.phoneHref, `tel:+965${PHONE}`);
});

test('another restaurant never gets Modawarah’s pages', () => {
  assert.equal(legalFor('khobzt-marie'), null);
  assert.equal(legalFor('burger-house'), null);
  assert.equal(legalFor(''), null);
  assert.equal(legalFor(undefined), null);
  assert.equal(legalFor('MDAWRA'), mdawra); // slugs are case-insensitive in the URL
});

test('the page URLs are the ones the client will be given', () => {
  assert.deepEqual(PAGE_PATH, { about: '/about', terms: '/terms', refund: '/refund-policy' });
});

test('a page falls back to the other language rather than showing nothing', () => {
  const onlyArabic = { about: { ar: { title: 'من نحن', blocks: [] } } };
  assert.equal(pageIn(onlyArabic, 'about', 'en').title, 'من نحن');
  assert.equal(pageIn(mdawra, 'about', 'en').title, 'About Us');
  assert.equal(pageIn(mdawra, 'nope', 'en'), null);
  assert.equal(pageIn(null, 'about', 'en'), null);
});

test('the phone number and Instagram handle become links; the rest of the wording is untouched', () => {
  const parts = richParts('For help call 22008080 or follow @dawerha.kw today.', mdawra.contact);
  assert.deepEqual(parts, [
    { text: 'For help call ' },
    { text: PHONE, href: 'tel:+96522008080' },
    { text: ' or follow ' },
    { text: '@dawerha.kw', href: 'https://www.instagram.com/dawerha.kw/' },
    { text: ' today.' },
  ]);
  assert.equal(parts.map((p) => p.text).join(''), 'For help call 22008080 or follow @dawerha.kw today.');
});

test('rejoining the pieces always gives back the original text, in Arabic too', () => {
  for (const page of PAGE_ORDER) {
    for (const lang of ['en', 'ar']) {
      for (const block of mdawra[page][lang].blocks) {
        const text = block.h ?? block.p;
        assert.equal(richParts(text, mdawra.contact).map((p) => p.text).join(''), text);
      }
    }
  }
  const arabic = richParts('يرجى الاتصال على 22008080 في أقرب وقت.', mdawra.contact);
  assert.equal(arabic.filter((p) => p.href).length, 1);
});

test('without contact details the text is returned as one piece', () => {
  assert.deepEqual(richParts('call 22008080'), [{ text: 'call 22008080' }]);
  assert.deepEqual(richParts('call 22008080', {}), [{ text: 'call 22008080' }]);
});
