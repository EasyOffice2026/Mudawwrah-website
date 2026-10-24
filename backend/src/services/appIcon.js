import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

/**
 * The picture that goes on a customer's home screen when they install a restaurant's website as an app: that
 * restaurant's logo, centred with margin all round so a phone that crops icons to a circle or a rounded square never
 * cuts into it. The background is the logo's own background colour (read from its corner), so a logo that is not a
 * square blends in without visible edges; a logo with a transparent background sits on the brand colour instead.
 *
 * Made on demand from the logo already uploaded, saved next to the uploads, and made again automatically if the logo or
 * the brand colour changes (both are in the file's name).
 */
export const ICON_SIZES = [180, 192, 512];

const HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_BASE = /^[A-Za-z0-9_-]+$/;
const FALLBACK_COLOUR = '#B00020';
// How much of the icon the logo may fill; the rest is margin (a phone's circular crop keeps the middle 80%).
const LOGO_SHARE = 0.8;

/** The uploaded file behind a stored logo address (".../uploads/<name>.jpg" or ".../uploads/thumbs/<name>.png"), or null. */
const logoFile = async (logoUrl) => {
  const match = /[/]uploads[/](?:thumbs[/])?([^/?#]+)$/.exec(String(logoUrl || ''));
  if (!match) return null;
  const base = path.parse(match[1]).name;
  if (!SAFE_BASE.test(base)) return null;
  for (const extension of ['.jpg', '.jpeg', '.png', '.webp']) {
    const candidate = path.join(path.resolve(config.uploadDir), `${base}${extension}`);
    try {
      await fs.access(candidate);
      return { base, file: candidate };
    } catch {
      // not this extension
    }
  }
  return null;
};

/** The colour of the logo's own background: its top-left corner, unless that is transparent (then the brand colour). */
const backgroundOf = async (source, fallback) => {
  try {
    const { data, info } = await sharp(source).rotate().extract({ left: 0, top: 0, width: 6, height: 6 }).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    if (info.channels === 4 && data[3] < 250) return fallback;
    return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return fallback;
  }
};

const build = async ({ size, colour, source }) => {
  if (!source) return sharp({ create: { width: size, height: size, channels: 4, background: colour } }).png().toBuffer();
  const background = await backgroundOf(source, colour);
  const inner = Math.round(size * LOGO_SHARE);
  const logo = await sharp(source).rotate().resize(inner, inner, { fit: 'contain', background }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
};

// One at a time, like the picture copies: a large logo takes memory on a small server.
let queue = Promise.resolve();

/** A PNG of the restaurant's app icon at `size`. Answers null for a size that is not offered. */
export const iconFor = async (tenant, size) => {
  if (!ICON_SIZES.includes(size)) return null;
  const colour = HEX.test(String(tenant?.brandColor || '')) ? tenant.brandColor : FALLBACK_COLOUR;
  const logo = await logoFile(tenant?.logoUrl);
  const dir = path.join(path.resolve(config.uploadDir), 'icons');
  const name = `${String(tenant.id).replace(/[^A-Za-z0-9]/g, '')}-${colour.slice(1)}-${logo?.base || 'none'}-${size}.png`;
  const target = path.join(dir, name);
  try {
    return await fs.readFile(target);
  } catch {
    // not made yet
  }
  const work = queue.catch(() => {}).then(async () => {
    const png = await build({ size, colour, source: logo?.file });
    await fs.mkdir(dir, { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, png);
    await fs.rename(temp, target);
    return png;
  });
  queue = work;
  return work;
};
