/**
 * The order object the website stores in Supabase `orders.payload` (jsonb).
 *
 * This mirrors the website's `orderTemplate()` plus the extra `shipments`
 * array its `convertQuoteToOrder()` attaches (index.html). The bot inserts
 * the exact same shape so an order created from Telegram renders on the
 * website's Orders page with no website change.
 */
export type OrderStatus =
  | "purchased"
  | "to_mailbox"
  | "in_mailbox"
  | "international"
  | "delivered";

export interface WebsiteOrderProduct {
  name: string;
  link: string;
}

export interface WebsiteOrderShipment {
  id: string;
  productName: string;
  shippingUrl: string;
  orderNumber: string;
  trackingNumber: string;
  status: OrderStatus;
}

export interface WebsiteOrder {
  id: string;
  customerName: string;
  customerShortTitle: string;
  orderNumber: string;
  sellerOrderNumber: string;
  sellerName: string;
  whatsappLink: string;
  productLink: string;
  productName: string;
  trackingNumber: string;
  localTracking: string;
  intlTracking: string;
  carrier: string;
  status: OrderStatus;
  /** YYYY-MM-DD, matching the website's todayInput(). */
  purchaseDate: string;
  statusUpdatedAt: string;
  notes: string;
  products: WebsiteOrderProduct[];
  shipments: WebsiteOrderShipment[];
  indirectShippingCustomer: number;
  /** Full ISO timestamp, matching the website's createdAt. */
  createdAt: string;
}
