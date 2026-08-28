import { type Context, type SessionFlavor } from "grammy";

import { quoteKeyboard } from "../../keyboards/index.js";
import {
  productListKeyboard,
  productUrlKeyboard,
  productInputKeyboard,
  currencyKeyboard,
  quantityKeyboard,
  shippingKeyboard,
  categoryKeyboard,
  currencyMainKeyboard,
  currencyConfirmedKeyboard,
  quantityMainKeyboard,
  quantityConfirmedKeyboard,
} from "../../keyboards/product.keyboard.js";
import {
  shippingMethodKeyboard,
  shippingInputKeyboard,
  indirectShippingKeyboard,
  estimateWeightKeyboard,
  shippingDiscountKeyboard,
  priceCarrierKeyboard,
  additionalFeesKeyboard,
  customFeeInputKeyboard,
  quoteSummaryKeyboard,
  customerQuoteKeyboard,
} from "../../keyboards/shipping.keyboard.js";
import {
  setQuoteType,
  beginProductEntry,
  beginShippingMethodSelection,
  setShippingMethodDirect,
  setShippingMethodIndirect,
  setShowEstimatePrompt,
  selectShippingDiscount,
  selectWarehouse,
  setShippingCompany,
  selectAdditionalFee,
  beginCustomFeeInput,
  continueFromAdditionalFees,
  backToAdditionalFees,
  beginCustomerQuote,
  setQuoteSummaryStep,
  resetQuoteSession,
  submitProductCurrency,
  submitProductQuantity,
  submitProductLocalShipping,
  submitProductCategory,
  skipProductCategory,
} from "../../services/quote.service.js";
import { submitOrderToWebsite } from "../../services/order.service.js";
import { shippingService } from "../../services/shipping.service.js";
import {
  DEFAULT_DISCOUNT,
  applyCarrierDiscount,
  discountedCarrierRate,
} from "../../services/discount.service.js";
import {
  getProductPromptText,
  getProductListText,
  getShippingPromptText,
  formatAllPricesText,
} from "../../formatters/quote.formatters.js";
import { title } from "../../formatters/ui.js";
import { CALLBACK_ACTIONS } from "../../constants/callback.actions.js";
import type { SessionData } from "../../session/session.js";
import type { AdditionalFeeType } from "../../types/quote.js";

export async function handleQuoteCallback(
  ctx: Context & SessionFlavor<SessionData>,
  action: string
): Promise<boolean> {
  // Discount screen (indirect only): the operator picks a percentage, then the
  // discounted carrier prices are loaded from the default warehouse.
  if (action.startsWith(CALLBACK_ACTIONS.SELECT_DISCOUNT_PREFIX)) {
    const discount = Number(action.slice(CALLBACK_ACTIONS.SELECT_DISCOUNT_PREFIX.length));
    const weight = ctx.session.draft.indirectWeight;

    if (!Number.isFinite(discount) || weight == null) {
      await ctx.reply("خطأ داخلي: تعذر تحديد نسبة الخصم أو الوزن.");
      return true;
    }

    try {
      selectShippingDiscount(ctx.session, discount);

      const warehouse = await shippingService.getDefaultWarehouse();
      if (!warehouse) {
        await ctx.reply("تعذر تحديد المستودع الافتراضي. تحقق من الإعدادات.");
        return true;
      }

      selectWarehouse(ctx.session, warehouse.id, warehouse.name);
      const rates = applyCarrierDiscount(
        await shippingService.getRatesForWeight(warehouse.id, weight),
        ctx.session.draft.shippingDiscount ?? DEFAULT_DISCOUNT
      );

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: priceCarrierKeyboard(rates),
      });
    } catch {
      await ctx.reply("تعذر تحميل أسعار الشحن حالياً. حاول لاحقاً.");
    }
    return true;
  }

  // Carriers are only ever chosen in the indirect flow; direct shipping goes
  // straight from its cost input to the customer quote.
  if (action.startsWith(CALLBACK_ACTIONS.SELECT_CARRIER_PREFIX)) {
    const carrierId = Number(action.slice(CALLBACK_ACTIONS.SELECT_CARRIER_PREFIX.length));
    if (!Number.isInteger(carrierId)) {
      await ctx.reply("خطأ داخلي: شركة شحن غير صالحة.");
      return true;
    }

    const { warehouseId, indirectWeight } = ctx.session.draft;
    if (warehouseId == null || indirectWeight == null) {
      await ctx.reply("خطأ داخلي: تعذر تحديد المستودع أو الوزن.");
      return true;
    }

    try {
      const rawRate = await shippingService.getRateForCarrier(warehouseId, carrierId, indirectWeight);
      if (!rawRate) {
        await ctx.reply("لا يوجد سعر متاح لهذه الشركة عند هذا الوزن.");
        return true;
      }

      // Store the same discounted price the operator saw on the button.
      const rate = discountedCarrierRate(rawRate, ctx.session.draft.shippingDiscount ?? DEFAULT_DISCOUNT);
      setShippingCompany(ctx.session, rate.carrierId, rate.carrierName, rate.price, rate.currency);

      // After the shipping company comes the additional-fees screen.
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: additionalFeesKeyboard(
          ctx.session.draft.additionalFeeType,
          ctx.session.draft.additionalFee
        ),
      });
    } catch {
      await ctx.reply("تعذر اختيار شركة الشحن حالياً. حاول لاحقاً.");
    }
    return true;
  }

  // Additional-fees screen: one option active at a time; "custom" asks for a value.
  if (action.startsWith(CALLBACK_ACTIONS.SELECT_ADDITIONAL_FEE_PREFIX)) {
    const type = action.slice(CALLBACK_ACTIONS.SELECT_ADDITIONAL_FEE_PREFIX.length) as AdditionalFeeType;

    if (type === "custom") {
      beginCustomFeeInput(ctx.session);
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: customFeeInputKeyboard,
      });
      return true;
    }

    selectAdditionalFee(ctx.session, type);
    await ctx.editMessageText(getShippingPromptText(ctx.session), {
      parse_mode: "Markdown",
      reply_markup: additionalFeesKeyboard(
        ctx.session.draft.additionalFeeType,
        ctx.session.draft.additionalFee
      ),
    });
    return true;
  }

  switch (action) {
    case CALLBACK_ACTIONS.CREATE_QUOTE:
      await ctx.editMessageText(`${title("🧾", "إنشاء تسعيرة")}\n\nاختر نوع الطلب:`, {
        parse_mode: "Markdown",
        reply_markup: quoteKeyboard,
      });
      return true;

    case CALLBACK_ACTIONS.QUOTE_SINGLE:
      setQuoteType(ctx.session, "single");
      // Skip the empty products screen: open the first product form immediately.
      beginProductEntry(ctx.session);
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productUrlKeyboard,
      });
      return true;

    case CALLBACK_ACTIONS.QUOTE_MULTI:
      setQuoteType(ctx.session, "multi");
      // Skip the empty products screen: open the first product form immediately.
      beginProductEntry(ctx.session);
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productUrlKeyboard,
      });
      return true;

    case CALLBACK_ACTIONS.ADD_PRODUCT:
      beginProductEntry(ctx.session);
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productUrlKeyboard,
      });
      return true;

    case CALLBACK_ACTIONS.CHANGE_CURRENCY: {
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: currencyKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SET_CURRENCY_USD:
    case CALLBACK_ACTIONS.SET_CURRENCY_SAR:
    case CALLBACK_ACTIONS.SET_CURRENCY_EUR:
    case CALLBACK_ACTIONS.SET_CURRENCY_GBP:
    case CALLBACK_ACTIONS.SET_CURRENCY_AUD:
    case CALLBACK_ACTIONS.SET_CURRENCY_CAD:
    case CALLBACK_ACTIONS.SET_CURRENCY_SGD: {
      const currency = action.replace("set_currency_", "").toUpperCase();
      const result = submitProductCurrency(ctx.session, currency);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: currencyConfirmedKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.CONTINUE_TO_QUANTITY: {
      ctx.session.draft.currentStep = "quantity";
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: quantityMainKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SHOW_QUANTITY_SELECTOR: {
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: quantityKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.ENTER_CUSTOM_QUANTITY: {
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productInputKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SELECT_QUANTITY_1:
    case CALLBACK_ACTIONS.SELECT_QUANTITY_2:
    case CALLBACK_ACTIONS.SELECT_QUANTITY_3:
    case CALLBACK_ACTIONS.SELECT_QUANTITY_4:
    case CALLBACK_ACTIONS.SELECT_QUANTITY_5: {
      const quantity = Number(action.replace("select_quantity_", ""));
      const result = submitProductQuantity(ctx.session, String(quantity));
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: quantityConfirmedKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.CONTINUE_TO_LOCAL_SHIPPING: {
      ctx.session.draft.currentStep = "localShipping";
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: shippingKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SET_FREE_SHIPPING: {
      const result = submitProductLocalShipping(ctx.session, "مجاني");
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }
      await ctx.editMessageText(getProductPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: categoryKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SKIP_CATEGORY: {
      const result = skipProductCategory(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }
      await ctx.editMessageText(getProductListText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productListKeyboard(ctx.session.draft.products.length > 0),
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_PRODUCT_LIST:
      ctx.session.draft.currentStep = undefined;
      await ctx.editMessageText(getProductListText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productListKeyboard(ctx.session.draft.products.length > 0),
      });
      return true;

    case CALLBACK_ACTIONS.BACK_TO_QUOTE_TYPE:
      ctx.session.draft.currentStep = undefined;
      await ctx.editMessageText(`${title("🧾", "إنشاء تسعيرة")}\n\nاختر نوع الطلب:`, {
        parse_mode: "Markdown",
        reply_markup: quoteKeyboard,
      });
      return true;

    case CALLBACK_ACTIONS.CONTINUE_QUOTE: {
      if (ctx.session.draft.products.length === 0) {
        await ctx.reply("أضف منتجًا واحدًا على الأقل قبل المتابعة.");
        return true;
      }

      beginShippingMethodSelection(ctx.session);
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: shippingMethodKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SET_SHIPPING_METHOD_DIRECT: {
      const result = setShippingMethodDirect(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: shippingInputKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SET_SHIPPING_METHOD_INDIRECT: {
      const result = setShippingMethodIndirect(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: indirectShippingKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_SHIPPING_METHOD: {
      ctx.session.draft.currentStep = "shipping_method";
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: shippingMethodKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.ESTIMATE_WEIGHT: {
      const result = setShowEstimatePrompt(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: estimateWeightKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_INDIRECT_WEIGHT: {
      ctx.session.draft.currentStep = "indirect_shipping_weight";
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: indirectShippingKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_SHIPPING_DISCOUNT: {
      ctx.session.draft.currentStep = "select_shipping_discount";
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: shippingDiscountKeyboard(ctx.session.draft.shippingDiscount),
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_SHIPPING_DETAILS: {
      if (ctx.session.draft.shippingMethod === "direct") {
        ctx.session.draft.currentStep = "direct_shipping_cost";
        await ctx.editMessageText(getShippingPromptText(ctx.session), {
          parse_mode: "Markdown",
          reply_markup: shippingInputKeyboard,
        });
      } else {
        ctx.session.draft.currentStep = "indirect_shipping_weight";
        await ctx.editMessageText(getShippingPromptText(ctx.session), {
          parse_mode: "Markdown",
          reply_markup: indirectShippingKeyboard,
        });
      }
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_SHIPPING_COMPANY: {
      const { shippingMethod, warehouseId, indirectWeight } = ctx.session.draft;

      // Direct shipping has no carrier screen to go back to -- its previous
      // step is the shipping cost input.
      if (shippingMethod !== "indirect" || warehouseId == null || indirectWeight == null) {
        ctx.session.draft.currentStep = "direct_shipping_cost";
        await ctx.editMessageText(getShippingPromptText(ctx.session), {
          parse_mode: "Markdown",
          reply_markup: shippingInputKeyboard,
        });
        return true;
      }

      ctx.session.draft.currentStep = "select_shipping_company";
      try {
        const rates = applyCarrierDiscount(
          await shippingService.getRatesForWeight(warehouseId, indirectWeight),
          ctx.session.draft.shippingDiscount ?? DEFAULT_DISCOUNT
        );
        await ctx.editMessageText(getShippingPromptText(ctx.session), {
          parse_mode: "Markdown",
          reply_markup: priceCarrierKeyboard(rates),
        });
      } catch {
        await ctx.reply("تعذر تحميل شركات الشحن حالياً. حاول لاحقاً.");
      }
      return true;
    }

    case CALLBACK_ACTIONS.CONTINUE_ADDITIONAL_FEES: {
      continueFromAdditionalFees(ctx.session);
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: quoteSummaryKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.BACK_TO_ADDITIONAL_FEES: {
      backToAdditionalFees(ctx.session);
      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: additionalFeesKeyboard(
          ctx.session.draft.additionalFeeType,
          ctx.session.draft.additionalFee
        ),
      });
      return true;
    }

    case CALLBACK_ACTIONS.GENERATE_CUSTOMER_QUOTE: {
      const result = beginCustomerQuote(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: customerQuoteKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.SEND_TO_WEBSITE: {
      const result = await submitOrderToWebsite(ctx.session);
      if (!result.success) {
        await ctx.reply(`❌ ${result.errorMessage}`);
        return true;
      }

      await ctx.reply("✅ تم إرسال الطلب إلى الموقع بنجاح");
      return true;
    }

    case CALLBACK_ACTIONS.EDIT_QUOTE: {
      const result = setQuoteSummaryStep(ctx.session);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return true;
      }

      await ctx.editMessageText(getShippingPromptText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: quoteSummaryKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.NEW_QUOTE: {
      resetQuoteSession(ctx.session);
      await ctx.editMessageText(`${title("🏠", "القائمة الرئيسية")}\n\nاختر أحد الخيارات:`, {
        parse_mode: "Markdown",
        reply_markup: quoteKeyboard,
      });
      return true;
    }

    case CALLBACK_ACTIONS.VIEW_ALL_PRICES: {
      const { shippingMethod, warehouseId, indirectWeight } = ctx.session.draft;
      if (shippingMethod !== "indirect" || warehouseId == null || indirectWeight == null) {
        await ctx.reply("📊 عرض جميع الأسعار متاح فقط بعد اختيار الشحن غير المباشر ومستودع.");
        return true;
      }

      try {
        const rates = applyCarrierDiscount(
          await shippingService.getRatesForWeight(warehouseId, indirectWeight),
          ctx.session.draft.shippingDiscount ?? DEFAULT_DISCOUNT
        );
        await ctx.reply(formatAllPricesText(rates), { parse_mode: "Markdown" });
      } catch {
        await ctx.reply("تعذر تحميل الأسعار حالياً. حاول لاحقاً.");
      }
      return true;
    }

    case CALLBACK_ACTIONS.EDIT_PRODUCT:
      ctx.session.draft.currentStep = "select_edit";
      await ctx.editMessageText(
        `${getProductListText(ctx.session)}\n\nأرسل رقم المنتج الذي تريد تعديله:`,
        {
          parse_mode: "Markdown",
          reply_markup: productListKeyboard(ctx.session.draft.products.length > 0),
        }
      );
      return true;

    case CALLBACK_ACTIONS.DELETE_PRODUCT:
      ctx.session.draft.currentStep = "select_delete";
      await ctx.editMessageText(
        `${getProductListText(ctx.session)}\n\nأرسل رقم المنتج الذي تريد حذفه:`,
        {
          parse_mode: "Markdown",
          reply_markup: productListKeyboard(ctx.session.draft.products.length > 0),
        }
      );
      return true;

    case CALLBACK_ACTIONS.PRODUCT_LIST:
      // An empty list only happens when the operator backs out of the very
      // first product; there is no empty products screen anymore, so return
      // to the order-type choice instead of showing it.
      if (ctx.session.draft.products.length === 0) {
        ctx.session.draft.currentStep = undefined;
        ctx.session.draft.activeProductId = undefined;
        await ctx.editMessageText(`${title("🧾", "إنشاء تسعيرة")}\n\nاختر نوع الطلب:`, {
          parse_mode: "Markdown",
          reply_markup: quoteKeyboard,
        });
        return true;
      }
      await ctx.editMessageText(getProductListText(ctx.session), {
        parse_mode: "Markdown",
        reply_markup: productListKeyboard(ctx.session.draft.products.length > 0),
      });
      return true;

    default:
      return false;
  }
}
