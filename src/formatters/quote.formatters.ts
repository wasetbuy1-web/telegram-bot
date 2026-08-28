import type { SessionData } from "../session/session.js";
import type { Product } from "../types/quote.js";
import type { CarrierRate } from "../types/shipping.js";
import { calculateQuoteTotals } from "../services/pricing.service.js";
import { additionalFeeLine } from "../services/additional-fee.service.js";
import { formatRiyal, formatSar, formatShippingPrice } from "../utils/money.js";
import { rtl, title } from "./ui.js";

export function formatAllPricesText(rates: CarrierRate[]): string {
  if (rates.length === 0) {
    return "📊 لا توجد أسعار متاحة حالياً لهذا المستودع والوزن.";
  }

  const lines = rates.map(
    (rate, index) =>
      `${index + 1}. ${rate.carrierName} - ${formatShippingPrice(rate.price, rate.currency)}`
  );

  return `${title("📊", "جميع الأسعار (من الأرخص إلى الأغلى):")}\n\n${lines.join("\n")}`;
}

export function getProductPromptText(session: SessionData): string {
  const step = session.draft.currentStep;
  switch (step) {
    case "url":
      return `${title("🔗", "أرسل رابط المنتج")}\n\nيرجى إرسال رابط المنتج الآن:`;
    case "name":
      return `${title("📌", "ما هو اسم المنتج؟")}\n\nأرسل اسم المنتج أو الصقه هنا:`;
    case "price":
      return `${title("💲", "ما هو سعر المنتج؟")}\n\nأرسل السعر بالأرقام فقط:`;
    case "currency": {
      const activeProduct = session.draft.products.find(
        (product) => product.id === session.draft.activeProductId
      );
      const currentCurrency = activeProduct?.currency ?? "USD";
      return rtl(`💱 *العملة الحالية:* ${currentCurrency}
       اضغط 🔄 لتغيير العملة.
       ثم اضغط ➡️ متابعة للانتقال للخطوة التالية.`);
      }
    case "quantity": {
      const activeProduct = session.draft.products.find(
        (product) => product.id === session.draft.activeProductId
      );
      const currentQuantity = activeProduct?.quantity ?? 1;
      return rtl(`🔢 *الكمية الحالية:* ${currentQuantity}
    اضغط ➕ لإدخال الكمية.
     ثم اضغط ➡️ متابعة.`);
    }
    case "localShipping":
      return `${title("🚚", "ما هو الشحن المحلي؟")}\n\nالافتراضي: مجاني\nأرسل قيمة الشحن أو اضغط مجاناً:`;
    case "category":
      return `${title("🏷️", "التصنيف (اختياري)")}\n\nأرسل التصنيف أو اضغط تخطى:`;
    default:
      return title("📦", "قائمة المنتجات");
  }
}

export function getProductListText(session: SessionData): string {
  const header = title("📦", "المنتجات");

  if (session.draft.products.length === 0) {
    return `${header}\n\nلا توجد منتجات حتى الآن.`;
  }

  const lines = session.draft.products.map((product, index) => {
    const priceLine = product.price != null
      ? `${product.price} ${product.currency ?? "USD"}`
      : "لم يتم تحديد السعر";

    const nameLine = product.name ? `${product.name}` : "-";
    return `${index + 1}. ${product.website}\n${nameLine}\n${priceLine}`;
  });

  return `${header}\n\n${lines.join("\n\n")}`;
}

export function getShippingPromptText(session: SessionData): string {
  switch (session.draft.currentStep) {
    case "shipping_method":
      return `${title("🚚", "اختر طريقة الشحن")}\n\nاختر طريقة الشحن الدولي:`;
    case "direct_shipping_cost":
      return `${title("🚚", "الشحن المباشر")}\n\nأدخل سعر الشحن بالريال السعودي`;
    case "indirect_shipping_weight":
      return `${title("📦", "الشحن غير المباشر")}\n\nأدخل الوزن الإجمالي للشحنة (lb):`;
    case "show_estimate_prompt": {
      const products = session.draft.products
        .map((product, index) => {
          return `${index + 1}.\nاسم المنتج:\n${product.name ?? "-"}\n\nالرابط:\n${product.url}`;
        })
        .join("\n\n");

      return `أحتاج تقدير الوزن الفعلي عند الشحن (مع التغليف العادي) للمنتجات التالية بالرطل (lb).

المنتجات:

${products}

المطلوب:

- الوزن الفعلي لكل منتج بعد التغليف العادي.
- الأبعاد لكل منتج بالبوصة (in).
- احسب الوزن الإجمالي لجميع المنتجات بالرطل (lb).
- اعتمد على مواصفات الشركة المصنعة أو المتاجر الموثوقة أو مصادر الشحن إن وجدت.
- لا تشرح طريقة الحساب.
- إذا لم تجد بيانات دقيقة، فاعطِ أفضل تقدير ممكن.

رتّب الإجابة بنفس ترتيب المنتجات السابقة.

لكل منتج اكتب:

الوزن:
الأبعاد بالبوصة (in):
المصادر:
نسبة التأكد:

وفي النهاية:

الوزن الإجمالي (lb):`;
    }
    case "select_shipping_discount":
      return `${title("💸", "خصم شركات الشحن")}\n\nاختر نسبة الخصم المطبقة على FedEx و DHL:`;
    case "select_shipping_company":
      return `${title("🚢", "اختر شركة الشحن")}\n\nاختر شركة الشحن التي تريد استخدامها:`;
    case "additional_fees":
      return `${title("💰", "الرسوم الإضافية")}\n\nاختر الرسوم الإضافية المطلوبة:`;
    case "additional_fee_custom":
      return `${title("✏️", "رسوم مخصصة")}\n\nأدخل قيمة الرسوم بالدولار الأمريكي.`;
    case "quote_summary":
      return getQuoteSummaryText(session);
    case "customer_quote":
      return getCustomerQuoteText(session);
    default:
      return title("🚚", "الشحن");
  }
}

const ZATCA_CALCULATOR_URL = "https://zatca.gov.sa/ar/eServices/Pages/Calculator.aspx";

/**
 * One product keeps the original spacing. Several are numbered and kept
 * tight, so each product reads as one unit and the blank line means "next
 * product" rather than "next field".
 */
function formatCustomerProducts(products: Product[]): string {
  const first = products[0];
  if (products.length === 1 && first) {
    return `اسم المنتج: ${first.name ?? "-"}\n\nالكمية: ${first.quantity ?? 1}`;
  }

  return products
    .map(
      (product, index) =>
        `${index + 1}.\nاسم المنتج: ${product.name ?? "-"}\nالكمية: ${product.quantity ?? 1}`
    )
    .join("\n\n");
}

/**
 * The message the operator forwards to the customer. Identical for direct
 * and indirect shipping -- both are fully priced here in the bot, and both
 * read their figures from the one calculateQuoteTotals call. The totals are
 * stated once, however many products the quote holds.
 */
export function getCustomerQuoteText(session: SessionData): string {
  const totals = calculateQuoteTotals(session.draft);
  const productsSection = formatCustomerProducts(session.draft.products);
  const feeLine = additionalFeeLine(session.draft.additionalFeeType, session.draft.additionalFee);

  return [
    "🛍️ عرض سعر الطلب",
    ...(productsSection ? [productsSection] : []),
    `💰 سعر المنتج + الشحن: ${formatRiyal(totals.productsPlusShipping)}`,
    `📋 العمولة: ${formatRiyal(totals.commission)}`,
    ...(feeLine ? [feeLine] : []),
    `✅ الإجمالي النهائي: ${formatRiyal(totals.finalTotal)}`,
    `📦 الرسوم الضريبية التقديرية: ${formatRiyal(totals.estimatedTax.total)}`,
    "تدفعها عند الاستلام من شركة الشحن.",
    `للتأكد استخدم حاسبة الرسوم الجمركية والضرائب:\n${ZATCA_CALCULATOR_URL}`,
  ].join("\n\n");
}

export function getQuoteSummaryText(session: SessionData): string {
  const quoteType = session.quoteType === "single" ? "طلب من موقع واحد" : "طلب من عدة مواقع";
  const shippingMethod = session.draft.shippingMethod === "direct"
    ? "مباشر"
    : session.draft.shippingMethod === "indirect"
      ? "غير مباشر"
      : "لم يتم اختيار طريقة شحن";
  const warehouseName = session.draft.warehouseName;
  const shippingCompany = session.draft.shippingCompany ?? "لم يتم الاختيار";
  const productCount = session.draft.products.length;
  const productLines = session.draft.products.map((product, index) => {
    const nameLine = product.name ? product.name : "-";
    const priceLine = product.price != null ? `${product.price} ${product.currency ?? "USD"}` : "لم يتم تحديد السعر";
    return `${index + 1}. ${product.website}\n${nameLine}\n${priceLine}`;
  });

  const shippingDetail = session.draft.shippingMethod === "direct"
    ? `التكلفة الدولية: ${
        session.draft.internationalShippingCost != null
          ? formatSar(session.draft.internationalShippingCost)
          : "لم يتم تحديدها"
      }`
    : session.draft.shippingMethod === "indirect"
      ? `الوزن: ${session.draft.indirectWeight ?? "لم يتم تحديده"} lb`
      : "لم يتم تحديد تفاصيل الشحن";

  const warehouseLine = warehouseName ? `\nالمستودع: ${warehouseName}` : "";

  const shippingPriceLine = session.draft.shippingPrice != null
    ? `\nسعر الشحن: ${formatShippingPrice(session.draft.shippingPrice, session.draft.shippingCurrency ?? "")}`
    : "";

  return `${title("🧾", "ملخص التسعيرة")}\n\nنوع التسعيرة: ${quoteType}\nطريقة الشحن: ${shippingMethod}${warehouseLine}\nشركة الشحن: ${shippingCompany}${shippingPriceLine}\nعدد المنتجات: ${productCount}\n\n${productLines.join("\n\n")}\n\n${shippingDetail}`;
}
