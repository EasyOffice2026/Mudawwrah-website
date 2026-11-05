import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paymentLine, testTicket } from '../src/lib/printQueue.js';
import { sameSiteUrl, toThermal } from '../src/lib/receiptLogo.js';

// A width x height picture of one colour, with a block of another colour.
const picture = (width, height, background, block, mark) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= block.left && x <= block.right && y >= block.top && y <= block.bottom;
      data.set([...(inside ? mark : background), 255], (y * width + x) * 4);
    }
  }
  return data;
};
const levelAt = (result, x, y) => result.data[(y * result.width + x) * 4];

const MAROON = [106, 6, 29];
const CREAM = [245, 225, 205];

test('light lettering on a dark logo prints as black lettering on white, cropped to the logo', () => {
  const result = toThermal(picture(40, 30, MAROON, { left: 15, right: 22, top: 10, bottom: 14 }, CREAM), 40, 30);
  // The lettering plus a 6-pixel margin, not the whole dark square.
  assert.equal(result.width, 8 + 12);
  assert.equal(result.height, 5 + 12);
  assert.equal(levelAt(result, 6, 6), 0, 'the lettering is black');
  assert.equal(levelAt(result, 0, 0), 255, 'the dark background is white paper');
});

test('dark lettering on a light logo stays dark lettering', () => {
  const result = toThermal(picture(30, 30, [255, 255, 255], { left: 10, right: 19, top: 10, bottom: 19 }, [20, 20, 20]), 30, 30);
  assert.equal(levelAt(result, 10, 10), 0);
  assert.equal(levelAt(result, 0, 0), 255);
});

test('a blank picture gives no logo, so the name prints alone', () => {
  assert.equal(toThermal(picture(10, 10, MAROON, { left: -1, right: -1, top: -1, bottom: -1 }, MAROON), 10, 10), null);
});

test('an uploaded logo is read from the page own address, whichever address of the site it was saved under', () => {
  assert.equal(
    sameSiteUrl('https://www.madawarah.com/uploads/logo.jpg', 'https://madawarah.com'),
    'https://madawarah.com/uploads/logo.jpg',
  );
  assert.equal(sameSiteUrl('/uploads/logo.jpg', 'https://khobztmaraei.com'), 'https://khobztmaraei.com/uploads/logo.jpg');
  // A picture elsewhere (Cloudinary) is left where it is.
  assert.equal(sameSiteUrl('https://res.cloudinary.com/x/logo.png', 'https://madawarah.com'), 'https://res.cloudinary.com/x/logo.png');
});

test('the payment box says plainly whether the money is in, and what to collect if not', () => {
  assert.equal(paymentLine({ paymentStatus: 'PAID', paymentMethod: 'KNET', total: 5 }), 'PAID · KNET');
  assert.equal(paymentLine({ paymentStatus: 'PAID', paymentMethod: 'APPLE_PAY', total: 5 }), 'PAID · Apple Pay');
  assert.equal(paymentLine({ paymentStatus: 'UNPAID', paymentMethod: 'CASH', total: 4.5 }), 'NOT PAID · Cash · collect KWD 4.500');
  assert.equal(paymentLine({ paymentStatus: 'FAILED', paymentMethod: 'KNET', total: 5 }), 'PAYMENT FAILED · NOT PAID');
  assert.equal(paymentLine({ paymentStatus: 'REFUNDED', paymentMethod: 'KNET', total: 5 }), 'REFUNDED · KNET');
});

test('the test ticket shows an Arabic name and an option, so a test print shows the whole layout', () => {
  const [item] = testTicket().items;
  assert.ok(item.nameAr);
  assert.ok(item.customizations[0].nameAr);
});
