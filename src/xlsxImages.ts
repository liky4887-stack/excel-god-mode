// ============================================================================
// src/xlsxImages.ts — Injects user images into an xlsx zip.
//
// If a sheet already has a <drawing> element (many templates do — logos,
// decorations), we MERGE our anchors into that existing drawing XML.
// Otherwise we create a fresh drawing file and wire it up.
// ============================================================================

import { strFromU8, strToU8 } from 'fflate';

interface SheetRef { name: string; path: string; }

interface OverlayLike {
  id: string;
  sheetName: string;
  row: number;
  col: number;
  type: 'image' | 'chart';
  imageUri?: string;
  size?: 'small' | 'medium' | 'large';
  scalePercent?: number;
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

function parseDataUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(uri);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes };
  } catch {
    return null;
  }
}

function extFromMime(mime: string): 'png' | 'jpeg' | 'gif' {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';
  if (mime.includes('gif')) return 'gif';
  return 'png';
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// XML builders
// ---------------------------------------------------------------------------

function twoCellAnchor(
  fromCol: number, fromRow: number,
  toCol: number, toRow: number,
  relId: string, picId: number, name: string
): string {
  return (
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:pic>` +
    `<xdr:nvPicPr>` +
    `<xdr:cNvPr id="${picId}" name="${escAttr(name)}"/>` +
    `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>` +
    `</xdr:nvPicPr>` +
    `<xdr:blipFill>` +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</xdr:blipFill>` +
    `<xdr:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</xdr:spPr>` +
    `</xdr:pic>` +
    `<xdr:clientData/>` +
    `</xdr:twoCellAnchor>`
  );
}

function drawingWrapper(anchors: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr ` +
    `xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    anchors +
    `</xdr:wsDr>`
  );
}

function drawingRelsXml(entries: Array<{ id: string; target: string }>): string {
  const body = entries
    .map((e) =>
      `<Relationship Id="${e.id}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
      `Target="${e.target}"/>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`
  );
}

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

function ensureImageContentType(xml: string, ext: 'png' | 'jpeg' | 'gif'): string {
  const mime = ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png';
  const re = new RegExp(`<Default\\s+Extension="${ext}"`, 'i');
  if (re.test(xml)) return xml;

  const newDefault = `<Default Extension="${ext}" ContentType="${mime}"/>`;
  // Insert AFTER the last existing <Default>
  const re2 = /<Default\b[^>]*\/>/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re2.exec(xml))) last = m;
  if (last) {
    const at = last.index + last[0].length;
    return xml.slice(0, at) + newDefault + xml.slice(at);
  }
  return xml.replace(/<Types\b[^>]*>/, (mm) => mm + newDefault);
}

function ensureDrawingContentType(xml: string, drawingNum: number): string {
  const partName = `/xl/drawings/drawing${drawingNum}.xml`;
  if (xml.includes(`PartName="${partName}"`)) return xml;

  const override =
    `<Override PartName="${partName}" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;

  // Insert AFTER the last existing <Override>
  const re = /<Override\b[^>]*\/>/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) last = m;
  if (last) {
    const at = last.index + last[0].length;
    return xml.slice(0, at) + override + xml.slice(at);
  }
  return xml.replace(/<\/Types>/, override + '</Types>');
}

// ---------------------------------------------------------------------------
// Sheet + drawing discovery
// ---------------------------------------------------------------------------

interface ExistingDrawing {
  drawingPath: string;
  drawingRelsPath: string;
  relId: string;
}

function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir + '/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function findExistingDrawing(
  files: Record<string, Uint8Array>,
  sheetXml: string,
  sheetPath: string
): ExistingDrawing | null {
  const m = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml);
  if (!m) return null;
  const relId = m[1];

  const sheetFile = sheetPath.split('/').pop() || '';
  const sheetDir = sheetPath.substring(0, sheetPath.lastIndexOf('/'));
  const sheetRelsPath = `${sheetDir}/_rels/${sheetFile}.rels`;
  if (!files[sheetRelsPath]) {
    if (__DEV__) console.log('[xlsxImages] no sheet rels at', sheetRelsPath);
    return null;
  }

  const relsXml = strFromU8(files[sheetRelsPath]);
  const relRe = new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`);
  const relMatch = relRe.exec(relsXml);
  if (!relMatch) {
    if (__DEV__) console.log('[xlsxImages] no rel entry for', relId);
    return null;
  }

  const drawingPath = resolvePath(sheetDir, relMatch[1]);
  const drawingFile = drawingPath.split('/').pop() || '';
  const drawingDir = drawingPath.substring(0, drawingPath.lastIndexOf('/'));
  const drawingRelsPath = `${drawingDir}/_rels/${drawingFile}.rels`;

  return { drawingPath, drawingRelsPath, relId };
}

// ---------------------------------------------------------------------------
// Rels merging
// ---------------------------------------------------------------------------

function appendDrawingRels(
  existing: string | null,
  newTargets: string[]
): { xml: string; idsUsed: string[] } {
  const idsUsed: string[] = [];

  if (!existing) {
    const entries = newTargets.map((t, i) => {
      const id = `rId${i + 1}`;
      idsUsed.push(id);
      return { id, target: t };
    });
    return { xml: drawingRelsXml(entries), idsUsed };
  }

  // Find highest rId number
  let maxId = 0;
  const re = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(existing))) {
    const n = parseInt(m[1], 10);
    if (n > maxId) maxId = n;
  }

  let append = '';
  for (const t of newTargets) {
    maxId++;
    const id = `rId${maxId}`;
    idsUsed.push(id);
    append += `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${t}"/>`;
  }

  const xml = existing.replace(/<\/Relationships>/, append + '</Relationships>');
  return { xml, idsUsed };
}

// ---------------------------------------------------------------------------
// Merge anchors into existing drawing XML (robust — string search, no regex
// on the closing tag)
// ---------------------------------------------------------------------------

function mergeAnchorsIntoDrawing(existingXml: string, newAnchors: string): string {
  if (__DEV__) {
    console.log('[MERGE] existing length:', existingXml.length);
    console.log('[MERGE] first 200:', JSON.stringify(existingXml.slice(0, 200)));
    console.log('[MERGE] last 200:', JSON.stringify(existingXml.slice(-200)));
  }

  // Try to find the closing tag with a plain string search — no regex.
  const candidates = ['</xdr:wsDr>', '</wsDr>'];
  for (const tag of candidates) {
    const idx = existingXml.lastIndexOf(tag);
    if (idx !== -1) {
      const result = existingXml.slice(0, idx) + newAnchors + existingXml.slice(idx);
      if (__DEV__) console.log('[MERGE] inserted', newAnchors.length, 'chars before', tag, 'at', idx);
      return result;
    }
  }

  if (__DEV__) console.warn('[MERGE] no closing wsDr tag found — falling back to fresh wrapper');
  return drawingWrapper(newAnchors);
}

// ---------------------------------------------------------------------------
// Insert <drawing> element into sheet XML
// ---------------------------------------------------------------------------

function insertDrawingRef(sheetXml: string, relId: string): string {
  if (/<drawing\b/.test(sheetXml)) return sheetXml;
  const ref = `<drawing r:id="${relId}"/>`;
  if (/<extLst\b/.test(sheetXml)) {
    return sheetXml.replace(/<extLst\b/, ref + '<extLst');
  }
  return sheetXml.replace(/<\/worksheet>\s*$/, ref + '</worksheet>');
}

function sheetRelsAddDrawing(existing: string | null, target: string): string {
  const newRel = `<Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${target}"/>`;
  if (!existing) {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${newRel}</Relationships>`
    );
  }
  if (/Type="[^"]*\/drawing"/.test(existing)) return existing;
  return existing.replace(/<\/Relationships>/, newRel + '</Relationships>');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------


// ---- Image dimension parser (PNG + JPEG) ----
function getImageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  if (mime.includes('png')) {
    if (bytes.length < 24) return { width: 200, height: 200 };
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (w > 0 && h > 0 && w < 100000 && h < 100000) return { width: w, height: h };
    return { width: 200, height: 200 };
  }
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      // SOF0..SOF15 (skip C4/C8/CC)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        if (w > 0 && h > 0) return { width: w, height: h };
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
    return { width: 200, height: 200 };
  }
  return { width: 200, height: 200 };
}

// ---- Pixel -> EMU (96 DPI) ----
const EMU_PER_PX = 9525;

// ---- Compute the EMU size preserving aspect ratio ----
function computeEmu(
  imgW: number, imgH: number,
  maxPx: number
): { cx: number; cy: number } {
  const scale = maxPx / Math.max(imgW, imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { cx: Math.round(w * EMU_PER_PX), cy: Math.round(h * EMU_PER_PX) };
}

// ---- oneCellAnchor: fixed pixel size, no stretching ----
function oneCellAnchor(
  fromCol: number, fromRow: number,
  cx: number, cy: number,
  relId: string, picId: number, name: string
): string {
  return (
    `<xdr:oneCellAnchor>` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:pic>` +
    `<xdr:nvPicPr>` +
    `<xdr:cNvPr id="${picId}" name="${escAttr(name)}"/>` +
    `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>` +
    `</xdr:nvPicPr>` +
    `<xdr:blipFill>` +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</xdr:blipFill>` +
    `<xdr:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</xdr:spPr>` +
    `</xdr:pic>` +
    `<xdr:clientData/>` +
    `</xdr:oneCellAnchor>`
  );
}

export function injectUserImages(
  files: Record<string, Uint8Array>,
  sheets: SheetRef[],
  overlays: OverlayLike[]
): { injected: string[]; skipped: string[] } {
  const injected: string[] = [];
  const skipped: string[] = [];

  const imageOverlays = overlays.filter(
    (o) => !!o.imageUri && (o.type === 'image' || o.type === 'chart')
  );
  if (imageOverlays.length === 0) return { injected, skipped };

  const bySheet: Record<string, OverlayLike[]> = {};
  for (const o of imageOverlays) {
    (bySheet[o.sheetName] = bySheet[o.sheetName] || []).push(o);
  }

  // Find next free media index
  let nextMediaNum = 1;
  while (
    files[`xl/media/image${nextMediaNum}.png`] ||
    files[`xl/media/image${nextMediaNum}.jpeg`] ||
    files[`xl/media/image${nextMediaNum}.jpg`] ||
    files[`xl/media/image${nextMediaNum}.gif`]
  ) {
    nextMediaNum++;
  }

  // Find next free drawing index
  let nextDrawingNum = 1;
  while (files[`xl/drawings/drawing${nextDrawingNum}.xml`]) nextDrawingNum++;

  let contentTypes = strFromU8(files['[Content_Types].xml'] || strToU8('<Types/>'));
  const extsAdded = new Set<string>();

  for (const sheet of sheets) {
    const overlaysHere = bySheet[sheet.name];
    if (!overlaysHere || overlaysHere.length === 0) continue;

    const sheetXmlPath = sheet.path;
    if (!files[sheetXmlPath]) continue;
    let sheetXml = strFromU8(files[sheetXmlPath]);

    // ---- Stage every image, collect target + anchor data ----
    interface Staged { id: string; fromCol: number; fromRow: number; cx: number; cy: number; target: string; }
    const staged: Staged[] = [];

    for (const ov of overlaysHere) {
      const parsed = parseDataUri(ov.imageUri || '');
      if (!parsed) { skipped.push(ov.id); continue; }

      const ext = extFromMime(parsed.mime);
      if (!extsAdded.has(ext)) {
        contentTypes = ensureImageContentType(contentTypes, ext);
        extsAdded.add(ext);
      }

      const mediaPath = `xl/media/image${nextMediaNum}.${ext}`;
      files[mediaPath] = parsed.bytes;

      // Compute pixel size for the anchor (preserves aspect ratio)
      const dims = getImageDimensions(parsed.bytes, parsed.mime);
      const basePx = ov.size === 'small' ? 100 : ov.size === 'large' ? 400 : 200;
      const px = ov.scalePercent
        ? Math.round((basePx * ov.scalePercent) / 100)
        : basePx;
      const { cx, cy } = computeEmu(dims.width, dims.height, px);

      if (__DEV__) {
        console.log(
          '[xlsxImages] staged', ov.id,
          'imgW:', dims.width, 'imgH:', dims.height,
          'size:', ov.size || 'medium',
          'px:', px, 'emu:', cx, 'x', cy
        );
      }

      staged.push({
        id: ov.id,
        fromCol: ov.col,
        fromRow: ov.row,
        cx,
        cy,
        target: `../media/image${nextMediaNum}.${ext}`,
      });
      nextMediaNum++;
    }

    if (staged.length === 0) continue;

    const existing = findExistingDrawing(files, sheetXml, sheetXmlPath);

    if (existing) {
      // ---- Merge into existing drawing ----
      const existingDrawingXml = files[existing.drawingPath]
        ? strFromU8(files[existing.drawingPath])
        : drawingWrapper('');
      const existingRelsXml = files[existing.drawingRelsPath]
        ? strFromU8(files[existing.drawingRelsPath])
        : null;

      const { xml: newRelsXml, idsUsed } = appendDrawingRels(
        existingRelsXml,
        staged.map((s) => s.target)
      );

      let picId = 100 + nextDrawingNum;
      const newAnchors = staged
        .map((s, i) =>
          oneCellAnchor(s.fromCol, s.fromRow, s.cx, s.cy, idsUsed[i], picId + i, s.id)
        )
        .join('');

      const mergedXml = mergeAnchorsIntoDrawing(existingDrawingXml, newAnchors);

      files[existing.drawingPath] = strToU8(mergedXml);
      files[existing.drawingRelsPath] = strToU8(newRelsXml);

      staged.forEach((s) => injected.push(s.id));

      if (__DEV__) {
        console.log(
          '[xlsxImages] sheet', sheet.name,
          'MERGED into', existing.drawingPath,
          'before:', existingDrawingXml.length,
          'after:', mergedXml.length,
          'anchors:', staged.length,
          'relIds:', idsUsed.join(',')
        );
        console.log('[xlsxImages] rels now:', newRelsXml.slice(0, 300));
      }
    } else {
      // ---- Create fresh drawing ----
      const drawingNum = nextDrawingNum++;
      const drawingPath = `xl/drawings/drawing${drawingNum}.xml`;
      const drawingRelsPath = `xl/drawings/_rels/drawing${drawingNum}.xml.rels`;

      const { xml: newRelsXml, idsUsed } = appendDrawingRels(
        null,
        staged.map((s) => s.target)
      );

      let picId = 100 + drawingNum;
      const newAnchors = staged
        .map((s, i) =>
          oneCellAnchor(s.fromCol, s.fromRow, s.cx, s.cy, idsUsed[i], picId + i, s.id)
        )
        .join('');

      contentTypes = ensureDrawingContentType(contentTypes, drawingNum);
      files[drawingPath] = strToU8(drawingWrapper(newAnchors));
      files[drawingRelsPath] = strToU8(newRelsXml);

      const sheetFile = sheetXmlPath.split('/').pop() || '';
      const sheetDir = sheetXmlPath.substring(0, sheetXmlPath.lastIndexOf('/'));
      const sheetRelsPath = `${sheetDir}/_rels/${sheetFile}.rels`;
      const existingSheetRels = files[sheetRelsPath] ? strFromU8(files[sheetRelsPath]) : null;
      const updatedRels = sheetRelsAddDrawing(existingSheetRels, `../drawings/drawing${drawingNum}.xml`);
      files[sheetRelsPath] = strToU8(updatedRels);

      sheetXml = insertDrawingRef(sheetXml, 'rIdDrawing1');
      files[sheetXmlPath] = strToU8(sheetXml);

      staged.forEach((s) => injected.push(s.id));

      if (__DEV__) {
        console.log('[xlsxImages] sheet', sheet.name, 'CREATED', drawingPath, 'anchors:', staged.length);
      }
    }
  }

  files['[Content_Types].xml'] = strToU8(contentTypes);
  return { injected, skipped };
}
