import { prisma } from '../../prisma.js';
import * as orderService from '../orderService.js';
import * as payment from '../payment/index.js';
import { getAll as getSettings } from '../settingService.js';
import { categoryName, itemName, money, t } from './copy.js';
import * as sessions from './sessionStore.js';
import { sendButtons, sendList, sendText } from './waClient.js';

const PAGE_SIZE = 8;
const round3 = (value) => Number(Number(value).toFixed(3));

const KEYWORDS = {
  menu: ['menu', 'hi', 'hello', 'start', 'order', 'مرحبا', 'منيو', 'اهلا', 'أهلا', 'السلام عليكم', 'طلب'],
  cart: ['cart', 'basket', 'سلة', 'السلة'],
  cancel: ['cancel', 'stop', 'الغاء', 'إلغاء'],
  pay: ['pay', 'payment', 'دفع', 'الدفع'],
  status: ['status', 'my order', 'حالة', 'طلبي'],
};

const matches = (text, group) => {
  const value = String(text || '').trim().toLowerCase();
  return KEYWORDS[group].some((keyword) => value === keyword || value.startsWith(`${keyword} `));
};

/* ------------------------------------------------------------------ helpers */

const formatAddress = (address) =>
  [
    address.area && `Area: ${address.area}`,
    address.block && `Block: ${address.block}`,
    address.street && `Street: ${address.street}`,
    address.building && `Building: ${address.building}`,
    address.extra && `Notes: ${address.extra}`,
  ]
    .filter(Boolean)
    .join('\n');

const loadCartLines = async (cart) => {
  if (!cart?.length) return [];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: cart.map((line) => line.menuItemId) } },
    include: { options: true },
  });
  return cart
    .map((line) => {
      const item = items.find((candidate) => candidate.id === line.menuItemId);
      if (!item) return null;
      const options = (line.optionIds || [])
        .map((id) => item.options.find((option) => option.id === id))
        .filter(Boolean);
      const unitPrice = round3(Number(item.price) + options.reduce((sum, o) => sum + Number(o.extraPrice), 0));
      return { line, item, options, unitPrice, lineTotal: round3(unitPrice * line.quantity) };
    })
    .filter(Boolean);
};

const cartSubtotal = (lines) => round3(lines.reduce((sum, l) => sum + l.lineTotal, 0));

/* ------------------------------------------------------------------- prompts */

const askLanguage = async (phone) => {
  await sendButtons(phone, t('en').chooseLanguage, [
    { id: 'lang:en', title: 'English' },
    { id: 'lang:ar', title: 'العربية' },
  ]);
  await sessions.save(phone, { state: 'LANG' });
};

const showMainMenu = async (session) => {
  const lang = session.lang;
  const copy = t(lang);
  await sendButtons(session.phone, copy.mainMenu(session.waName), [
    { id: 'menu:browse', title: copy.browseMenu },
    { id: 'cart:view', title: copy.viewCart },
    { id: 'order:last', title: copy.myLastOrder },
  ]);
  await sessions.save(session.phone, { state: 'MENU' });
};

const showCategories = async (session) => {
  const copy = t(session.lang);
  const categories = await prisma.category.findMany({
    where: { isVisible: true, items: { some: { isAvailable: true } } },
    orderBy: { displayOrder: 'asc' },
  });
  if (!categories.length) {
    await sendText(session.phone, copy.fallback);
    return showMainMenu(session);
  }
  await sendList(session.phone, {
    text: copy.pickCategory,
    buttonLabel: copy.categories,
    sections: [
      {
        title: copy.categories,
        rows: categories.slice(0, 10).map((category) => ({
          id: `cat:${category.id}:0`,
          title: categoryName(session.lang, category),
          description: session.lang === 'ar' ? category.subtitleAr || undefined : category.subtitleEn || undefined,
        })),
      },
    ],
  });
  return sessions.save(session.phone, { state: 'CATEGORY' });
};

const showItems = async (session, categoryId, page = 0) => {
  const copy = t(session.lang);
  const items = await prisma.menuItem.findMany({
    where: { categoryId, isAvailable: true, isOutOfStock: false },
    orderBy: { displayOrder: 'asc' },
  });
  const slice = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (!slice.length) return showCategories(session);
  const rows = slice.map((item) => ({
    id: `item:${item.id}`,
    title: itemName(session.lang, item),
    description: money(item.price),
  }));
  if (items.length > (page + 1) * PAGE_SIZE) rows.push({ id: `cat:${categoryId}:${page + 1}`, title: copy.more });
  rows.push({ id: 'menu:browse', title: copy.back });
  await sendList(session.phone, { text: copy.pickItem, buttonLabel: copy.items, sections: [{ title: copy.items, rows }] });
  return sessions.save(session.phone, { state: 'CATEGORY', draft: { ...session.draft, categoryId } });
};

const startItem = async (session, itemId) => {
  const copy = t(session.lang);
  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, include: { options: true } });
  if (!item || !item.isAvailable || item.isOutOfStock) {
    await sendText(session.phone, copy.fallback);
    return showCategories(session);
  }
  const draft = {
    ...session.draft,
    pending: { menuItemId: item.id, quantity: 1, optionIds: [], groupIndex: 0 },
  };
  await sendText(session.phone, copy.chooseQuantity(itemName(session.lang, item), money(item.price)));
  return sessions.save(session.phone, { state: 'QTY', draft });
};

const optionGroups = (item) => {
  const groups = [];
  for (const option of [...item.options].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const key = option.groupEn;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.options.push(option);
    else groups.push({ key, groupEn: option.groupEn, groupAr: option.groupAr, isRequired: option.isRequired, options: [option] });
  }
  return groups;
};

/** Asks for the next customization group, or adds the item to the cart when done. */
const askNextOptionOrAdd = async (session) => {
  const copy = t(session.lang);
  const pending = session.draft.pending;
  const item = await prisma.menuItem.findUnique({ where: { id: pending.menuItemId }, include: { options: true } });
  const groups = optionGroups(item);
  const group = groups[pending.groupIndex];
  if (!group) return addPendingToCart(session, item);

  const label = session.lang === 'ar' && group.groupAr ? group.groupAr : group.groupEn;
  const rows = group.options.map((option) => ({
    id: `opt:${option.id}`,
    title: session.lang === 'ar' && option.nameAr ? option.nameAr : option.nameEn,
    description: Number(option.extraPrice) > 0 ? `+ ${money(option.extraPrice)}` : undefined,
  }));
  if (!group.isRequired) rows.push({ id: 'opt:skip', title: copy.optionsSkip });
  await sendList(session.phone, {
    text: copy.chooseOptions(label),
    buttonLabel: label,
    sections: [{ title: label, rows: rows.slice(0, 10) }],
  });
  return sessions.save(session.phone, { state: 'OPTIONS' });
};

const addPendingToCart = async (session, item) => {
  const copy = t(session.lang);
  const pending = session.draft.pending;
  const cart = [...(session.cart || []), { menuItemId: pending.menuItemId, quantity: pending.quantity, optionIds: pending.optionIds }];
  await sendText(session.phone, copy.addedToCart(itemName(session.lang, item), pending.quantity));
  const draft = { ...session.draft };
  delete draft.pending;
  const updated = await sessions.save(session.phone, { cart, draft, state: 'CART' });
  return showCart(updated);
};

const showCart = async (session) => {
  const copy = t(session.lang);
  const lines = await loadCartLines(session.cart);
  if (!lines.length) {
    await sendText(session.phone, copy.cartEmpty);
    return showMainMenu(session);
  }
  const body = lines
    .map(({ item, options, lineTotal, line }) => {
      const extras = options.length ? `\n   ${options.map((o) => (session.lang === 'ar' && o.nameAr ? o.nameAr : o.nameEn)).join(', ')}` : '';
      return `• ${line.quantity} × ${itemName(session.lang, item)}${extras}\n   ${money(lineTotal)}`;
    })
    .join('\n');
  await sendButtons(
    session.phone,
    `*${copy.cartHeader}*\n${body}\n\n${copy.cartFooter(money(cartSubtotal(lines)))}`,
    [
      { id: 'cart:checkout', title: copy.checkout },
      { id: 'menu:browse', title: copy.addMore },
      { id: 'cart:clear', title: copy.clearCart },
    ],
  );
  return sessions.save(session.phone, { state: 'CART' });
};

/* ------------------------------------------------------------------ checkout */

const startCheckout = async (session) => {
  const copy = t(session.lang);
  const settings = await getSettings();
  const lines = await loadCartLines(session.cart);
  if (!lines.length) {
    await sendText(session.phone, copy.cartEmpty);
    return showMainMenu(session);
  }
  if (settings.isOpen !== 'true') {
    await sendText(session.phone, copy.closed.replace('{hours}', settings.workingHours));
    return sessions.save(session.phone, { state: 'MENU' });
  }
  if (cartSubtotal(lines) < Number(settings.minimumOrder)) {
    await sendText(session.phone, copy.minimumOrder(money(settings.minimumOrder)));
    return showCart(session);
  }
  await sendText(session.phone, copy.askName);
  return sessions.save(session.phone, { state: 'NAME' });
};

const askAddress = async (session) => {
  const copy = t(session.lang);
  const saved = await prisma.customerAddress.findFirst({
    where: { phone: session.phone },
    orderBy: { updatedAt: 'desc' },
  });
  if (saved) {
    await sendButtons(session.phone, copy.useSavedAddress(formatAddress(saved)), [
      { id: 'addr:saved', title: copy.yes },
      { id: 'addr:new', title: copy.newAddress },
    ]);
    return sessions.save(session.phone, { state: 'ADDR_CONFIRM' });
  }
  await sendText(session.phone, copy.askArea);
  return sessions.save(session.phone, { state: 'ADDR_AREA' });
};

const askPayment = async (session) => {
  const copy = t(session.lang);
  const buttons = [{ id: 'pay:cash', title: copy.payCash }];
  if (payment.isOnlinePaymentEnabled()) buttons.unshift({ id: 'pay:online', title: copy.payOnline });
  const lines = await loadCartLines(session.cart);
  const settings = await getSettings();
  const subtotal = cartSubtotal(lines);
  const deliveryFee = round3(settings.deliveryFee);
  const serviceCharge = round3((subtotal * Number(settings.serviceChargePercent)) / 100);
  const summary = `*${copy.orderSummary}*\n${lines
    .map((l) => `• ${l.line.quantity} × ${itemName(session.lang, l.item)} — ${money(l.lineTotal)}`)
    .join('\n')}\n\n${money(subtotal)} + ${money(deliveryFee)}${serviceCharge ? ` + ${money(serviceCharge)}` : ''} = *${money(
    subtotal + deliveryFee + serviceCharge,
  )}*`;
  await sendText(session.phone, summary);
  await sendButtons(session.phone, copy.choosePayment, buttons);
  return sessions.save(session.phone, { state: 'PAYMENT' });
};

const placeOrder = async (session, online) => {
  const copy = t(session.lang);
  const address = session.draft.address || {};
  const order = await orderService.create({
    customerName: session.draft.name || session.waName || session.phone,
    customerPhone: session.phone,
    address: formatAddress(address),
    area: address.area,
    block: address.block,
    street: address.street,
    building: address.building,
    notes: address.extra,
    channel: 'WHATSAPP',
    paymentMethod: online ? 'KNET' : 'CASH',
    items: (session.cart || []).map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      optionIds: line.optionIds,
    })),
  });

  if (address.area) {
    const existing = await prisma.customerAddress.findFirst({ where: { phone: session.phone } });
    const data = { phone: session.phone, ...address };
    if (existing) await prisma.customerAddress.update({ where: { id: existing.id }, data });
    else await prisma.customerAddress.create({ data });
  }

  if (online) {
    try {
      const link = await payment.startPayment(order, session.lang);
      if (link) {
        await sendText(session.phone, copy.payNow(link.url), true);
        return sessions.save(session.phone, { state: 'AWAIT_PAYMENT', cart: [], draft: {}, lastOrderId: order.id });
      }
    } catch (error) {
      console.error('[whatsapp] payment link failed', error);
    }
    await sendText(session.phone, copy.paymentUnavailable);
  }
  await sendText(session.phone, copy.orderPlaced(order.orderNumber, money(order.total)));
  return sessions.save(session.phone, { state: 'MENU', cart: [], draft: {}, lastOrderId: order.id });
};

const showLastOrder = async (session) => {
  const copy = t(session.lang);
  const order = await prisma.order.findFirst({
    where: { customerPhone: session.phone },
    orderBy: { createdAt: 'desc' },
  });
  await sendText(session.phone, order ? copy.orderStatus(order.orderNumber, order.status) : copy.noOrders);
  return showMainMenu(session);
};

const saveFeedback = async (session, rating) => {
  const copy = t(session.lang);
  if (!session.lastOrderId) return showMainMenu(session);
  await prisma.orderFeedback.upsert({
    where: { orderId: session.lastOrderId },
    update: { rating },
    create: { orderId: session.lastOrderId, phone: session.phone, rating },
  });
  await sendText(session.phone, copy.askComment);
  return sessions.save(session.phone, { state: 'FEEDBACK_COMMENT' });
};

/* -------------------------------------------------------------- entry point */

/**
 * Advances the conversation for one inbound message.
 * `input` is `{ text, replyId }` where replyId is the id of a tapped button/list row.
 */
export const handleInbound = async ({ phone, waName, text, replyId }) => {
  let session = await sessions.load(phone, waName);
  const copy = t(session.lang);
  const id = replyId || '';

  if (id.startsWith('lang:')) {
    const lang = id.split(':')[1] === 'ar' ? 'ar' : 'en';
    session = await sessions.save(phone, { lang, state: 'MENU' });
    await sendText(phone, t(lang).languageSet);
    return showMainMenu(session);
  }

  if (session.state === 'START' || (!id && matches(text, 'menu') && session.state === 'START')) {
    return askLanguage(phone);
  }

  // Global keywords work from any state.
  if (!id) {
    if (matches(text, 'cancel')) {
      await sendText(phone, copy.cancelled);
      return sessions.reset(phone);
    }
    if (matches(text, 'cart')) return showCart(session);
    if (matches(text, 'status')) return showLastOrder(session);
    if (matches(text, 'menu') && !['QTY', 'NAME', 'ADDR_AREA', 'ADDR_BLOCK', 'ADDR_STREET', 'ADDR_BUILDING', 'ADDR_EXTRA', 'FEEDBACK_RATING', 'FEEDBACK_COMMENT'].includes(session.state)) {
      return showMainMenu(session);
    }
    if (matches(text, 'pay') && session.state === 'AWAIT_PAYMENT') {
      const order = session.lastOrderId ? await prisma.order.findUnique({ where: { id: session.lastOrderId } }) : null;
      if (order && order.paymentUrl) return sendText(phone, copy.payNow(order.paymentUrl), true);
    }
  }

  if (id === 'menu:browse') return showCategories(session);
  if (id === 'cart:view') return showCart(session);
  if (id === 'order:last') return showLastOrder(session);
  if (id === 'cart:clear') {
    await sendText(phone, copy.cartCleared);
    return sessions.reset(phone, { lang: session.lang, lastOrderId: session.lastOrderId });
  }
  if (id === 'cart:checkout') return startCheckout(session);
  if (id.startsWith('cat:')) {
    const [, categoryId, page] = id.split(':');
    return showItems(session, categoryId, Number(page) || 0);
  }
  if (id.startsWith('item:')) return startItem(session, id.split(':')[1]);

  switch (session.state) {
    case 'LANG':
      return askLanguage(phone);

    case 'QTY': {
      const quantity = Number(String(text).trim());
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return sendText(phone, copy.invalidQuantity);
      }
      session = await sessions.save(phone, {
        draft: { ...session.draft, pending: { ...session.draft.pending, quantity } },
      });
      return askNextOptionOrAdd(session);
    }

    case 'OPTIONS': {
      if (!id.startsWith('opt:')) return sendText(phone, copy.fallback);
      const optionId = id.split(':')[1];
      const pending = session.draft.pending;
      const next = {
        ...pending,
        groupIndex: pending.groupIndex + 1,
        optionIds: optionId === 'skip' ? pending.optionIds : [...pending.optionIds, optionId],
      };
      session = await sessions.save(phone, { draft: { ...session.draft, pending: next } });
      return askNextOptionOrAdd(session);
    }

    case 'NAME': {
      const name = String(text || '').trim();
      if (!name) return sendText(phone, copy.askName);
      session = await sessions.save(phone, { draft: { ...session.draft, name } });
      return askAddress(session);
    }

    case 'ADDR_CONFIRM': {
      if (id === 'addr:saved') {
        const saved = await prisma.customerAddress.findFirst({
          where: { phone },
          orderBy: { updatedAt: 'desc' },
        });
        session = await sessions.save(phone, {
          draft: {
            ...session.draft,
            address: {
              area: saved?.area,
              block: saved?.block,
              street: saved?.street,
              building: saved?.building,
              extra: saved?.extra,
            },
          },
        });
        return askPayment(session);
      }
      await sendText(phone, copy.askArea);
      return sessions.save(phone, { state: 'ADDR_AREA' });
    }

    case 'ADDR_AREA':
    case 'ADDR_BLOCK':
    case 'ADDR_STREET':
    case 'ADDR_BUILDING':
    case 'ADDR_EXTRA': {
      const value = String(text || '').trim();
      if (!value) return sendText(phone, copy.fallback);
      const steps = {
        ADDR_AREA: ['area', 'ADDR_BLOCK', copy.askBlock],
        ADDR_BLOCK: ['block', 'ADDR_STREET', copy.askStreet],
        ADDR_STREET: ['street', 'ADDR_BUILDING', copy.askBuilding],
        ADDR_BUILDING: ['building', 'ADDR_EXTRA', copy.askExtra],
        ADDR_EXTRA: ['extra', 'PAYMENT', null],
      };
      const [field, nextState, prompt] = steps[session.state];
      const skipped = ['no', 'none', 'لا', '-'].includes(value.toLowerCase());
      const address = { ...(session.draft.address || {}), [field]: skipped && field === 'extra' ? null : value };
      session = await sessions.save(phone, { state: nextState, draft: { ...session.draft, address } });
      if (prompt) return sendText(phone, prompt);
      return askPayment(session);
    }

    case 'PAYMENT': {
      if (id === 'pay:online') return placeOrder(session, true);
      if (id === 'pay:cash') return placeOrder(session, false);
      return askPayment(session);
    }

    case 'FEEDBACK_RATING': {
      const rating = Number(String(id.startsWith('rate:') ? id.split(':')[1] : text).trim());
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return sendText(phone, copy.invalidRating);
      return saveFeedback(session, rating);
    }

    case 'FEEDBACK_COMMENT': {
      const comment = String(text || '').trim();
      const skipped = ['no', 'none', 'لا', '-'].includes(comment.toLowerCase());
      if (!skipped && session.lastOrderId) {
        await prisma.orderFeedback.update({ where: { orderId: session.lastOrderId }, data: { comment } }).catch(() => {});
      }
      await sendText(phone, copy.feedbackThanks);
      return sessions.save(phone, { state: 'MENU' });
    }

    case 'CART':
      return showCart(session);

    default:
      return showMainMenu(session);
  }
};
