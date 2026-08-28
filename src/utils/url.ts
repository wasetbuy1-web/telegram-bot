export interface UrlValidationSuccess {
  valid: true;
  url: string;
  website: string;
}

export interface UrlValidationFailure {
  valid: false;
  errorMessage: string;
}

export type UrlValidationResult = UrlValidationSuccess | UrlValidationFailure;

const DEFAULT_SCHEME = "https://";
const ALLOWED_PROTOCOLS = ["http:", "https:"];

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function validateUrl(value: string): UrlValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      valid: false,
      errorMessage: "الرابط فارغ. أرسل رابط منتج صالح.",
    };
  }

  const urlWithProtocol = /^[a-zA-Z][a-zA-Z\d+-.]*:\/\//.test(trimmed)
    ? trimmed
    : `${DEFAULT_SCHEME}${trimmed}`;

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlWithProtocol);
  } catch {
    return {
      valid: false,
      errorMessage: "الرابط غير صالح. تأكد من كتابة رابط موقع صحيح.",
    };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      errorMessage: "الرابط يجب أن يبدأ بـ http:// أو https://.",
    };
  }

  const website = normalizeHostname(parsedUrl.hostname);
  if (!website) {
    return {
      valid: false,
      errorMessage: "الرابط غير صالح. تأكد من وجود اسم نطاق صحيح.",
    };
  }

  return {
    valid: true,
    url: parsedUrl.toString(),
    website,
  };
}
