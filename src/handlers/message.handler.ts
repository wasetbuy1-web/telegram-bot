import { type Context, type SessionFlavor, InlineKeyboard } from "grammy";
import type { SessionData } from "../session/session.js";
import {
  submitProductUrl,
  submitProductName,
  submitProductPrice,
  submitProductCurrency,
  submitProductQuantity,
  submitProductLocalShipping,
  submitProductCategory,
  submitInternationalShippingCost,
  submitIndirectShippingWeight,
  submitCustomFee,
  setProductToEdit,
  deleteProductByIndex,
} from "../services/quote.service.js";
import {
  getProductPromptText,
  getProductListText,
  getShippingPromptText,
} from "../formatters/quote.formatters.js";
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
} from "../keyboards/product.keyboard.js";
import {
  customerQuoteKeyboard,
  shippingDiscountKeyboard,
  additionalFeesKeyboard,
} from "../keyboards/shipping.keyboard.js";

async function updatePrompt(
  ctx: Context & SessionFlavor<SessionData>,
  text: string,
  keyboard: InlineKeyboard
) {
  const chatId = ctx.chat?.id;
  const messageId = ctx.session.draft.lastPromptMessageId;

  if (chatId && messageId) {
    try {
      await ctx.api.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    } catch {
      // fall back to reply
    }
  }

  const message = await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
  ctx.session.draft.lastPromptMessageId = message.message_id;
}

export async function messageHandler(ctx: Context & SessionFlavor<SessionData>) {
  const rawText = ctx.message?.text?.trim();
  if (!rawText) return;

  const step = ctx.session.draft.currentStep;
  if (!step) return;

  switch (step) {
    case "url": {
      const result = submitProductUrl(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), productInputKeyboard);
      return;
    }

    case "name": {
      const result = submitProductName(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), productInputKeyboard);
      return;
    }

    case "price": {
      const result = submitProductPrice(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), currencyMainKeyboard);
      return;
    }

    case "currency": {
      const result = submitProductCurrency(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), currencyConfirmedKeyboard);
      return;
    }

    case "quantity": {
      const result = submitProductQuantity(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), quantityConfirmedKeyboard);
      return;
    }

    case "localShipping": {
      const result = submitProductLocalShipping(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(ctx, getProductPromptText(ctx.session), categoryKeyboard);
      return;
    }

    case "category": {
      const result = submitProductCategory(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(
        ctx,
        getProductListText(ctx.session),
        productListKeyboard(ctx.session.draft.products.length > 0)
      );
      return;
    }

    // Direct shipping ends the conversation: no warehouse, no carrier, the
    // priced customer quote is produced immediately.
    case "direct_shipping_cost": {
      const result = submitInternationalShippingCost(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }

      await updatePrompt(ctx, getShippingPromptText(ctx.session), customerQuoteKeyboard);
      return;
    }

    // Weight is followed by the shipping-discount screen; carriers come after
    // the discount is chosen (see the discount callback).
    case "indirect_shipping_weight": {
      const result = submitIndirectShippingWeight(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }

      await updatePrompt(
        ctx,
        getShippingPromptText(ctx.session),
        shippingDiscountKeyboard(ctx.session.draft.shippingDiscount)
      );
      return;
    }

    case "show_estimate_prompt": {
      await ctx.reply(getShippingPromptText(ctx.session));
      return;
    }

    case "select_shipping_discount": {
      await ctx.reply("اختر نسبة الخصم من الأزرار أدناه.");
      return;
    }

    case "select_shipping_company": {
      await ctx.reply("اختر شركة شحن من الأزرار أدناه.");
      return;
    }

    case "additional_fees": {
      await ctx.reply("اختر أحد خيارات الرسوم من الأزرار أدناه.");
      return;
    }

    case "additional_fee_custom": {
      const result = submitCustomFee(ctx.session, rawText);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }
      await updatePrompt(
        ctx,
        getShippingPromptText(ctx.session),
        additionalFeesKeyboard(ctx.session.draft.additionalFeeType, ctx.session.draft.additionalFee)
      );
      return;
    }

    case "quote_summary": {
      await ctx.reply("تم عرض ملخص التسعيرة. استخدم الأزرار للعودة أو الإلغاء.");
      return;
    }

    case "select_edit": {
      const index = Number(rawText);
      if (!Number.isInteger(index) || index <= 0 || index > ctx.session.draft.products.length) {
        await ctx.reply("رقم المنتج غير صالح. أرسل رقم المنتج الموجود في القائمة.");
        return;
      }

      const result = setProductToEdit(ctx.session, index - 1);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }

      await updatePrompt(ctx, getProductPromptText(ctx.session), productUrlKeyboard);
      return;
    }

    case "select_delete": {
      const index = Number(rawText);
      if (!Number.isInteger(index) || index <= 0 || index > ctx.session.draft.products.length) {
        await ctx.reply("رقم المنتج غير صالح. أرسل رقم المنتج الموجود في القائمة.");
        return;
      }

      const result = deleteProductByIndex(ctx.session, index - 1);
      if (!result.success) {
        await ctx.reply(result.errorMessage);
        return;
      }

      await updatePrompt(
        ctx,
        getProductListText(ctx.session),
        productListKeyboard(ctx.session.draft.products.length > 0)
      );
      return;
    }

    default:
      return;
  }
}
