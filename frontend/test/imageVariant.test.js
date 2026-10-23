import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dishPicture, gridPicture, originalPicture, variantUrl } from '../src/lib/imageVariant.js';

test('an upload becomes its made-to-size copy, whichever copy the address pointed at', () => {
  const site = 'https://www.madawarah.com';
  assert.equal(variantUrl(`${site}/uploads/1788-ab12.jpg`, 'w900'), `${site}/uploads/w900/1788-ab12.webp`);
  assert.equal(variantUrl(`${site}/uploads/thumbs/1788-ab12.png`, 'w400'), `${site}/uploads/w400/1788-ab12.webp`);
  assert.equal(variantUrl('/uploads/1788-ab12.jpeg?v=2', 'w400'), '/uploads/w400/1788-ab12.webp');
});

test('a picture hosted elsewhere, or nothing at all, is left alone', () => {
  assert.equal(variantUrl('https://res.cloudinary.com/x/image/upload/v1/a.jpg', 'w400'), 'https://res.cloudinary.com/x/image/upload/v1/a.jpg');
  assert.equal(variantUrl(null, 'w400'), null);
  assert.equal(variantUrl('', 'w400'), '');
});

test('grid, dish page and fallback pictures for a menu item', () => {
  const image = { url: 'https://www.madawarah.com/uploads/9-x.jpg', thumbnailUrl: 'https://www.madawarah.com/uploads/thumbs/9-x.jpg' };
  assert.equal(gridPicture(image), 'https://www.madawarah.com/uploads/w400/9-x.webp');
  assert.equal(dishPicture(image), 'https://www.madawarah.com/uploads/w900/9-x.webp');
  assert.equal(originalPicture(image), 'https://www.madawarah.com/uploads/thumbs/9-x.jpg');
});

test('an item with no picture gets the placeholder everywhere', () => {
  for (const pick of [gridPicture, dishPicture, originalPicture]) {
    assert.equal(pick(null), '/placeholder.svg');
    assert.equal(pick({}), '/placeholder.svg');
  }
});
