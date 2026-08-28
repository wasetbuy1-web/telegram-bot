/**
 * Converts the bot's quote/session into the SAME order object the website
 * builds in `convertQuoteToOrder()` (index.html). No new structure is
 * invented: the website spreads `orderTemplate()` and overrides a handful of
 * fields, and this mirrors that field for field.
 *
 * - a product becomes `{ name, link }` (link = the product URL)
 * - multi-site quotes get one `shipment` per product; single-site gets none
 * - `indirectShippingCustomer` is the international shipping the customer pays
 *   in SAR, taken from the existing pricing calculation (unchanged)
 */
import { randomUUID } from "crypto";
import type { SessionData } from "../session/session.js";
import type {
  WebsiteOrder,
  WebsiteOrderProduct,
  WebsiteOrderShipment,
} from "../types/order.js";
import { calculateShippingTotalSar } from "./pricing.service.js";

/** YYYY-MM-DD, matching the website's todayInput(). */
function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildWebsiteOrder(session: SessionData): WebsiteOrder {
  const products: WebsiteOrderProduct[] = session.draft.products.map((product) => ({
    name: product.name ?? "",
    link: product.url,
  }));

  // Multi-site quotes: each product becomes its own shipment, exactly as the
  // website does for orderType === 'multiSite'.
  const shipments: WebsiteOrderShipment[] =
    session.quoteType === "multi"
      ? products.map((product) => ({
          id: randomUUID(),
          productName: product.name,
          shippingUrl: product.link,
          orderNumber: "",
          trackingNumber: "",
          status: "purchased",
        }))
      : [];

  const today = todayInput();

  return {
    id: randomUUID(),
    customerName: "",
    customerShortTitle: "",
    orderNumber: "",
    sellerOrderNumber: "",
    sellerName: "",
    whatsappLink: "",
    productLink: products.find((product) => product.link)?.link ?? "",
    productName: "",
    trackingNumber: "",
    localTracking: "",
    intlTracking: "",
    carrier: session.draft.shippingCompany ?? "",
    status: "purchased",
    purchaseDate: today,
    statusUpdatedAt: today,
    notes: "",
    products,
    shipments,
    indirectShippingCustomer: calculateShippingTotalSar(session.draft),
    createdAt: new Date().toISOString(),
  };
}
