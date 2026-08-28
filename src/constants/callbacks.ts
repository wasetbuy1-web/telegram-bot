/**
 * Dashboard callback identifiers.
 *
 * Namespaced and payload-carrying, so one handler covers a whole family of
 * actions instead of one constant per value (the previous scheme needed
 * seven constants for currencies and five for quantities).
 *
 * Telegram limits callback_data to 64 bytes. The longest identifier here is
 * `p:del:ok:<uuid>` -- 9 bytes plus a 36-character UUID -- which fits with
 * room to spare, so product ids stay as randomUUID().
 *
 * This file is additive: the legacy flow keeps using callback.actions.ts
 * until the old screens are removed.
 */

export const CALLBACKS = {
  PRODUCT_ADD: "p:add",
  PRODUCT_EDIT: "p:edit:",
  PRODUCT_DELETE: "p:del:",
  PRODUCT_MANAGE: "p:manage",

  SHIPPING_METHOD_DIRECT: "sh:m:direct",
  SHIPPING_METHOD_INDIRECT: "sh:m:indirect",
  SHIPPING_WAREHOUSE: "sh:wh",
  SHIPPING_WEIGHT: "sh:w",

  QUOTE_CANCEL: "q:cancel",
  NAV_HOME: "nav:home",
} as const;

export function withId(prefix: string, id: string): string {
  return `${prefix}${id}`;
}
