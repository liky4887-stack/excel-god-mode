// ============================================================================
// src/xlsxStyles.ts
//
// Manages xl/styles.xml. When the user applies bold or a background color to
// a cell/row/column in the app, we register a NEW <xf> entry that inherits the
// cell's original border, alignment, and number format, only changing fontId
// and fillId. Returns the new style index to write into the cell's s="..."
// attribute.
// ============================================================================

export interface StyleRegistrar {
  /** Given a base xf index and desired style, return an xf index that has
   *  the original's other properties plus bold+fill applied. */
  applyToXf(baseXfIndex: number, bold: boolean, bg?: string, align?: 'left' | 'center' | 'right'): number;
  finalize(): string;
}

export function createStyleRegistrar(stylesXml: string): StyleRegistrar {
  const fontsMatch = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
  const fillsMatch = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(stylesXml);
  const xfsMatch = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);

  let fontsXml = fontsMatch ? fontsMatch[1] : '';
  let fontsCount = (fontsXml.match(/<font\b/g) || []).length;
  let fillsXml = fillsMatch ? fillsMatch[1] : '';
  let fillsCount = (fillsXml.match(/<fill\b/g) || []).length;
  let xfsXml = xfsMatch ? xfsMatch[1] : '';
  let xfsCount = (xfsXml.match(/<xf\b/g) || []).length;

  let boldFontId: number | null = null;
  const fillCache: Record<string, number> = {};
  const xfCache: Record<string, number> = {};

  function normalizeColor(hex: string): string {
    const h = hex.replace('#', '').toUpperCase();
    if (h.length === 6) return 'FF' + h;
    if (h.length === 8) return h;
    return 'FF000000';
  }

  function findBoldFont(): number {
    if (boldFontId !== null) return boldFontId;
    const fonts = fontsXml.match(/<font\b[^>]*>[\s\S]*?<\/font>/g) || [];
    for (let i = 0; i < fonts.length; i++) {
      if (/<b\s*\/>|<b\s+val="(?:1|true)"\s*\/>/.test(fonts[i])) {
        boldFontId = i;
        return i;
      }
    }
    fontsXml += '<font><b/></font>';
    boldFontId = fontsCount;
    fontsCount++;
    return boldFontId;
  }

  function findOrAddFill(rgb: string): number {
    if (fillCache[rgb] !== undefined) return fillCache[rgb];
    const fills = fillsXml.match(/<fill\b[^>]*>[\s\S]*?<\/fill>/g) || [];
    for (let i = 0; i < fills.length; i++) {
      if (new RegExp(`<fgColor\\s+rgb="${rgb}"`).test(fills[i])) {
        fillCache[rgb] = i;
        return i;
      }
    }
    const newFill = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
    fillsXml += newFill;
    fillCache[rgb] = fillsCount;
    fillsCount++;
    return fillCache[rgb];
  }

  function getXfBlock(idx: number): string {
    // cellXfs contains <xf .../> or <xf ...>...</xf> entries
    const re = /<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g;
    const all = xfsXml.match(re) || [];
    return all[idx] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  }

  function setAttr(xf: string, attr: string, value: string | number): string {
    const re = new RegExp('\\s' + attr + '="[^"]*"');
    if (re.test(xf)) return xf.replace(re, ' ' + attr + '="' + value + '"');
    return xf.replace(/<xf\b/, '<xf ' + attr + '="' + value + '"');
  }


  /**
   * Ensure the <xf> block contains an <alignment horizontal="..."/> child.
   * Handles both self-closing `<xf .../>` and open `<xf ...>...</xf>`.
   */
  function applyAlignmentToXf(xf: string, align: 'left' | 'center' | 'right'): string {
    // If the <xf> is self-closing, convert to open/close and insert alignment
    if (/<xf\b[^>]*\/>/.test(xf)) {
      return xf.replace(/<xf\b([^>]*)\/>/, `<xf$1><alignment horizontal="${align}"/></xf>`);
    }
    // If it already has an <alignment>, replace its horizontal attribute
    if (/<alignment\b[^>]*\/>/.test(xf)) {
      return xf.replace(
        /<alignment\b([^>]*)\/>/,
        (m, attrs) => {
          if (/\shorizontal=/.test(attrs)) {
            return `<alignment${attrs.replace(/\shorizontal="[^"]*"/, ` horizontal="${align}"`)}/>`;
          }
          return `<alignment${attrs} horizontal="${align}"/>`;
        }
      );
    }
    // Otherwise insert a fresh <alignment/> as the first child of <xf>
    return xf.replace(/<xf\b([^>]*)>/, `<xf$1><alignment horizontal="${align}"/>`);
  }

  return {
    applyToXf(baseXfIndex, bold, bg, align): number {
      const cacheKey = `${baseXfIndex}|${bold ? 'b' : ''}|${bg || ''}|${align || ''}`;
      if (xfCache[cacheKey] !== undefined) return xfCache[cacheKey];

      const fontId = bold ? findBoldFont() : 0;
      const fillId = bg ? findOrAddFill(normalizeColor(bg)) : 0;

      let xf = getXfBlock(baseXfIndex);

      if (fontId > 0) {
        xf = setAttr(xf, 'fontId', fontId);
        xf = setAttr(xf, 'applyFont', '1');
      }
      if (fillId > 0) {
        xf = setAttr(xf, 'fillId', fillId);
        xf = setAttr(xf, 'applyFill', '1');
      }

      if (align) {
        // Excel's cellXfs has an inner <alignment> child for horizontal alignment.
        // Self-closing xf blocks need to be expanded to hold the child.
        xf = setAttr(xf, 'applyAlignment', '1');
        xf = applyAlignmentToXf(xf, align);
      }

      xfsXml += xf;
      const newIndex = xfsCount;
      xfsCount++;

      xfCache[cacheKey] = newIndex;
      return newIndex;
    },

    finalize(): string {
      let out = stylesXml;
      out = out.replace(
        /<fonts\s+count="\d+"[^>]*>[\s\S]*?<\/fonts>/,
        `<fonts count="${fontsCount}">${fontsXml}</fonts>`
      );
      out = out.replace(
        /<fills\s+count="\d+"[^>]*>[\s\S]*?<\/fills>/,
        `<fills count="${fillsCount}">${fillsXml}</fills>`
      );
      out = out.replace(
        /<cellXfs\s+count="\d+"[^>]*>[\s\S]*?<\/cellXfs>/,
        `<cellXfs count="${xfsCount}">${xfsXml}</cellXfs>`
      );
      return out;
    },
  };
}
