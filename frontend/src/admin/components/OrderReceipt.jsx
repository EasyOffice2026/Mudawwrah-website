import { dateTime, kwd } from '../../lib/format';

/**
 * A kitchen ticket for one order — always rendered, kept off-screen until
 * printing. `.print-receipt` is exactly what index.css's print rule reveals
 * and everything else on the page hides, so this is the only thing that ever
 * reaches the paper regardless of what admin screen it was printed from.
 *
 * Kept deliberately plain — no logo, no colour, no layout that assumes a
 * particular paper width — since the actual hardware here is whatever small
 * thermal printer the restaurant already has plugged in, reached through the
 * browser's own print dialog rather than anything this app talks to directly.
 */
export default function OrderReceipt({ order, restaurantName, lang = 'en' }) {
  if (!order) return null;

  const address =
    order.orderType === 'PICKUP'
      ? `Pickup${order.pickupLocation ? ' — ' + order.pickupLocation.nameEn : ''}`
      : order.address || '—';

  return (
    <div className="print-receipt hidden font-mono text-[13px] leading-snug text-black">
      <p className="text-center text-base font-bold">{restaurantName || 'Order'}</p>
      <p className="text-center">{order.orderNumber}</p>
      <p className="text-center">{dateTime(order.createdAt, lang)}</p>

      <div className="my-2 border-t border-dashed border-black" />

      <p className="font-bold">{order.orderType === 'PICKUP' ? 'PICKUP' : 'DELIVERY'}</p>
      <p>{address}</p>
      {order.deliveryNote ? <p>Note: {order.deliveryNote}</p> : null}
      <p className="mt-1">
        {order.customerName} · {order.customerPhone}
      </p>

      <div className="my-2 border-t border-dashed border-black" />

      {order.items.map((item) => (
        <div key={item.id} className="mb-1 flex justify-between gap-2">
          <span>
            {item.quantity} × {item.nameEn}
            {item.customizations?.length ? (
              <span className="block pl-3 text-[12px]">{item.customizations.map((c) => c.nameEn).join(', ')}</span>
            ) : null}
          </span>
          <span className="shrink-0">{kwd(item.lineTotal)}</span>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{kwd(order.subtotal)}</span>
      </div>
      {Number(order.deliveryFee) > 0 ? (
        <div className="flex justify-between">
          <span>Delivery</span>
          <span>{kwd(order.deliveryFee)}</span>
        </div>
      ) : null}
      {Number(order.serviceCharge) > 0 ? (
        <div className="flex justify-between">
          <span>Service</span>
          <span>{kwd(order.serviceCharge)}</span>
        </div>
      ) : null}
      {Number(order.discount) > 0 ? (
        <div className="flex justify-between">
          <span>Discount ({order.promoCode})</span>
          <span>-{kwd(order.discount)}</span>
        </div>
      ) : null}
      {Number(order.tip) > 0 ? (
        <div className="flex justify-between">
          <span>Tip</span>
          <span>{kwd(order.tip)}</span>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between border-t border-black pt-1 text-base font-bold">
        <span>TOTAL</span>
        <span>{kwd(order.total)}</span>
      </div>

      <p className="mt-2">
        {order.paymentMethod} · {order.paymentStatus}
        {order.cutlery ? ' · Cutlery' : ''}
      </p>
      {order.notes ? <p className="mt-1">Notes: {order.notes}</p> : null}
    </div>
  );
}
