/**
 * Preprocessing wrapper for xlsx files that use XML numeric character
 * references (&#xNNN;) for non-Latin characters.
 *
 * The xlsx@0.18.x library has a bug where it truncates 3+ digit hex
 * references to their low byte (&#x413; → U+0013 instead of U+0413 = Г).
 *
 * Fix: unzip the xlsx, convert all &#xNNN; and &#NNN; references to real
 * Unicode characters in every XML file, then re-zip and pass to xlsx.read().
 * xlsx then sees plain UTF-8 text and reads it correctly.
 */
import { unzipSync, zipSync } from 'fflate';

/** Decode all XML numeric character references in a UTF-8 XML string. */
function decodeXmlEntities(text: string): string {
  return text
    // Hex references: &#x41F; → П
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Decimal references: &#1055; → П
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/**
 * Returns an ArrayBuffer of the xlsx file with all XML entity references
 * decoded to their actual Unicode characters.
 * Non-XML files (images, binary data) are passed through unchanged.
 */
export function preprocessXlsx(buffer: ArrayBuffer): ArrayBuffer {
  const files = unzipSync(new Uint8Array(buffer));
  const fixed: Record<string, [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {};

  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('.xml') || path.endsWith('.rels')) {
      const original = new TextDecoder('utf-8').decode(bytes);
      const patched = decodeXmlEntities(original);
      fixed[path] = [new TextEncoder().encode(patched), { level: 0 }];
    } else {
      fixed[path] = [bytes, { level: 0 }];
    }
  }

  const rezipped = zipSync(fixed);
  return rezipped.buffer as ArrayBuffer;
}
