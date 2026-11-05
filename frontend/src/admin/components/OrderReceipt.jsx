import { dateTime, kwd } from '../../lib/format';
import { paymentLine } from '../../lib/printQueue';

const amount = (value) => Number(value || 0).toFixed(3);

const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

const Row = ({ label, value, strong = false }) => (
  <div className={`flex justify-between gap-2 ${strong ? 'text-[16px] font-extrabold' : ''}`}>
    <span>{label}</span>
    <span className="shrink-0 tabular-nums">{value}</span>
  </div>
);

/**
 * The paper ticket for one order: always rendered, kept off-screen until printing. `.print-receipt` is exactly
 * what index.css's print rule reveals and everything else on the page hides, so this is the only thing that
 * reaches the paper, whichever screen it was printed from.
 *
 * Black on white only, sized to the paper (58 mm handhelds like the Sunmi V3e, 80 mm counter printers). The logo
 * comes ready for a thermal printer (lib/receiptLogo.js): without it the restaurant's name stands in.
 */
export default function OrderReceipt({ order, restaurantName, logo = null, lang = 'en' }) {
  if (!order) return null;

  const pickup = order.orderType === 'PICKUP';
  const branch = (pickup ? order.pickupLocation : order.branch) || order.pickupLocation || order.branch;

  return (
    <div className="print-receipt hidden bg-white font-sans text-[12px] leading-snug text-black">
      <header className="text-center">
        {logo ? <img src={logo} alt="" className="mx-auto mb-1 max-h-[22mm] max-w-[60%] object-contain" /> : null}
        <p className="text-[14px] font-extrabold">{restaurantName || 'Order'}</p>
        {branch ? (
          <p>
            {branch.nameEn}
            {branch.nameAr ? <> · <bdi>{branch.nameAr}</bdi></> : null}
          </p>
        ) : null}
      </header>

      <Rule />

      <div className="text-center">
        <p className="text-[22px] font-black leading-tight tracking-wide">{order.orderNumber}</p>
        <p>{dateTime(order.createdAt, lang)}</p>
        <p className="mx-auto mt-1 w-fit border-2 border-black px-3 py-0.5 text-[16px] font-extrabold tracking-widest">
          {pickup ? 'PICKUP' : 'DELIVERY'}
        </p>
      </div>

      <Rule />

      <p className="text-[14px] font-bold">{order.customerName}</p>
      <p className="tabular-nums">{order.customerPhone}</p>
      {!pickup ? (
        <>
          {order.zone || order.area ? (
            <p className="font-bold">
              {order.zone?.nameEn || order.area}
              {order.zone?.nameAr ? <> · <bdi>{order.zone.nameAr}</bdi></> : null}
            </p>
          ) : null}
          <p>{order.address || '—'}</p>
          {order.deliveryNote ? <p>Driver: {order.deliveryNote}</p> : null}
        </>
      ) : null}

      <Rule />

      {order.items.map((item) => (
        <div key={item.id} className="mb-1.5">
          <div className="flex justify-between gap-2 font-bold">
            <span>
              {item.quantity} × {item.nameEn}
            </span>
            <span className="shrink-0 tabular-nums">{amount(item.lineTotal)}</span>
          </div>
          {item.nameAr ? (
            <p className="ps-4">
              <bdi>{item.nameAr}</bdi>
            </p>
          ) : null}
          {item.customizations?.map((c) => (
            <p key={c.id || c.nameEn} className="ps-4">
              + {c.nameEn}
              {c.nameAr ? <> · <bdi>{c.nameAr}</bdi></> : null}
            </p>
          ))}
        </div>
      ))}

      <Rule />

      <Row label="Subtotal" value={amount(order.subtotal)} />
      {Number(order.deliveryFee) > 0 ? <Row label="Delivery" value={amount(order.deliveryFee)} /> : null}
      {Number(order.serviceCharge) > 0 ? <Row label="Service" value={amount(order.serviceCharge)} /> : null}
      {Number(order.discount) > 0 ? (
        <Row label={`Discount${order.promoCode ? ` (${order.promoCode})` : ''}`} value={`-${amount(order.discount)}`} />
      ) : null}
      {Number(order.tip) > 0 ? <Row label="Tip" value={amount(order.tip)} /> : null}
      <div className="mt-1 border-t-2 border-black pt-1">
        <Row label="TOTAL" value={kwd(order.total)} strong />
      </div>

      <p className="mt-2 border-2 border-black py-1 text-center text-[13px] font-extrabold">{paymentLine(order)}</p>

      {order.cutlery ? <p className="mt-1 font-bold">✓ Cutlery</p> : null}
      {order.notes ? (
        <p className="mt-1 border border-dashed border-black p-1 font-bold">Note: {order.notes}</p>
      ) : null}

      <Rule />
      <p className="text-center">
        Thank you · <bdi>شكراً لكم</bdi>
      </p>
    </div>
  );
}
