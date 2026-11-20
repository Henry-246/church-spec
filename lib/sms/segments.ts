// SMS length and segment ("units") calculator.
//
// One SMS holds 160 characters of the standard GSM alphabet. Longer messages
// are split into parts of 153 characters (7 are used to join the parts).
// If the text contains ANY character outside the GSM alphabet (e.g. emoji,
// curly quotes “ ”, or many accented letters) the whole message switches to
// Unicode: 70 characters for one SMS, 67 per part when split.
// Some GSM characters (^ { } \ [ ] ~ | €) take up 2 places.

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

export type SegmentInfo = {
  encoding: "GSM-7" | "Unicode";
  /** Length as the phone network counts it (GSM: extended chars count 2; Unicode: UTF-16 units). */
  length: number;
  segments: number;
  /** Characters allowed per segment at this length (160/153 or 70/67). */
  perSegment: number;
  /** Characters left before another segment is needed. */
  remaining: number;
  /** Characters that forced Unicode (to help the admin replace them). */
  unicodeChars: string[];
};

export function countSegments(text: string): SegmentInfo {
  let gsmLength = 0;
  const unicodeChars: string[] = [];
  for (const ch of text) {
    if (BASIC.has(ch)) gsmLength += 1;
    else if (EXTENDED.has(ch)) gsmLength += 2;
    else unicodeChars.push(ch);
  }

  if (unicodeChars.length === 0) {
    return build("GSM-7", gsmLength, 160, 153, []);
  }
  // UCS-2 counts UTF-16 code units (an emoji usually counts as 2).
  return build("Unicode", text.length, 70, 67, [...new Set(unicodeChars)]);
}

function build(
  encoding: SegmentInfo["encoding"],
  length: number,
  single: number,
  multi: number,
  unicodeChars: string[],
): SegmentInfo {
  if (length === 0) return { encoding, length, segments: 0, perSegment: single, remaining: single, unicodeChars };
  if (length <= single) {
    return { encoding, length, segments: 1, perSegment: single, remaining: single - length, unicodeChars };
  }
  const segments = Math.ceil(length / multi);
  return { encoding, length, segments, perSegment: multi, remaining: segments * multi - length, unicodeChars };
}

/** Longest message allowed in the admin (6 SMS of standard text). */
export const MAX_BODY = 918;
