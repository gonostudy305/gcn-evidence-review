/**
 * AI Provenance Detection & Verification (client-side, dependency-free)
 *
 * Two jobs:
 *  1. detectAiProvenance()  — read the ORIGINAL upload bytes and report, dynamically,
 *     WHICH platform generated the image (OpenAI/gpt-image, Google/Imagen, Midjourney,
 *     Adobe Firefly, Stability, …). Nothing about the provider is hardcoded to a single
 *     vendor — we parse the C2PA/JUMBF manifest, the IPTC digitalSourceType, EXIF Software
 *     and XMP generator fields, then match against a signature table. Unknown generators
 *     are reported verbatim rather than swallowed.
 *  2. verifyNoProvenance() — scan an EXPORTED blob's bytes and confirm no AI-provenance
 *     marker survived (C2PA caBX/JUMBF, digitalSourceType, known generator strings).
 *     This is what powers the post-export "verify" — the message it feeds is derived
 *     from the real detection above, never a fixed string.
 *
 * Design notes:
 *  - We only string-scan METADATA containers (PNG ancillary chunks, JPEG APP segments,
 *    WebP RIFF metadata chunks), not pixel data, so this stays cheap even for 10MB files.
 *  - Provider matching runs against *scoped* text (C2PA manifest, EXIF/XMP field VALUES),
 *    never raw XMP namespace URIs — otherwise every file carrying an `ns.adobe.com` XMP
 *    packet would falsely look like Adobe.
 */

export interface AiProvenanceResult {
    /** True when at least one trustworthy AI-origin signal was found. */
    isAiGenerated: boolean;
    /** Canonical provider id, e.g. "OpenAI" | "Google" | "Midjourney". null when unknown. */
    provider: string | null;
    /** Human-facing label for the provider (or the raw generator when provider is unknown). */
    providerLabel: string;
    /** Raw claim-generator string as embedded, e.g. "OpenAI Media Service API". */
    generator: string | null;
    /** Model + version when discoverable, e.g. "gpt-image 2.0". */
    model: string | null;
    /** IPTC digitalSourceType value, e.g. "trainedAlgorithmicMedia". */
    digitalSourceType: string | null;
    /** C2PA action ids found, e.g. ["c2pa.created", "c2pa.watermarked.unbound"]. */
    actions: string[];
    /** Whether a signed C2PA / Content Credentials manifest is present. */
    hasC2pa: boolean;
    /** Which containers carried the signal, e.g. ["C2PA/caBX", "XMP:CreatorTool"]. */
    signals: string[];
    confidence: 'high' | 'medium' | 'low';
}

interface ProviderSignature {
    id: string;
    label: string;
    /** Matched against scoped provenance text (manifest + field values), case-insensitive. */
    patterns: RegExp[];
}

/**
 * Signature table. Order matters only for tie-breaks (first match wins).
 * Patterns are intentionally specific to generator identifiers, not generic vendor names,
 * so they don't trip on unrelated metadata.
 */
const PROVIDER_SIGNATURES: ProviderSignature[] = [
    { id: 'OpenAI', label: 'OpenAI (ChatGPT / DALL·E / gpt-image)', patterns: [/openai/i, /gpt-image/i, /dall[\s._·-]?e/i] },
    { id: 'Google', label: 'Google (Gemini / Imagen)', patterns: [/\bimagen\b/i, /\bgemini\b/i, /made with google ai/i, /google deepmind/i, /synthid/i] },
    { id: 'Midjourney', label: 'Midjourney', patterns: [/midjourney/i] },
    { id: 'Adobe Firefly', label: 'Adobe Firefly', patterns: [/firefly/i] },
    { id: 'Stability AI', label: 'Stability AI (Stable Diffusion)', patterns: [/stability ?ai/i, /stable[\s-]?diffusion/i, /\bsdxl\b/i] },
    { id: 'Black Forest Labs', label: 'Black Forest Labs (FLUX)', patterns: [/black forest/i, /\bflux\.1\b/i, /\bflux\b/i] },
    { id: 'xAI', label: 'xAI (Grok)', patterns: [/\bx\.?ai\b/i, /\bgrok\b/i, /aurora/i] },
    { id: 'Microsoft', label: 'Microsoft (Designer / Copilot)', patterns: [/microsoft designer/i, /copilot/i, /bing image creator/i] },
    { id: 'Meta AI', label: 'Meta AI', patterns: [/meta ai/i, /meta platforms/i, /\bemu\b/i, /imagine with meta/i] },
    { id: 'Ideogram', label: 'Ideogram', patterns: [/ideogram/i] },
    { id: 'Leonardo AI', label: 'Leonardo AI', patterns: [/leonardo\.?ai/i] },
    { id: 'Recraft', label: 'Recraft', patterns: [/recraft/i] },
    { id: 'Canva', label: 'Canva (Magic Media)', patterns: [/magic media/i, /canva/i] },
];

/** Model/version extractor — grabs a generator token plus a short trailing version. */
const MODEL_PATTERNS: RegExp[] = [
    /gpt-image[\s-]?v?[\d.]*/i,
    /dall[\s._·-]?e[\s-]?\d?/i,
    /imagen[\s-]?[\d.]*/i,
    /gemini[\s-][\w.-]{1,18}/i,
    /midjourney[\s-]?v?[\d.]*/i,
    /firefly[\s-]?(?:image[\s-]?)?[\d.]*/i,
    /stable[\s-]?diffusion[\s-]?[\w.]*/i,
    /sdxl[\s-]?[\w.]*/i,
    /flux\.?1?[\s-]?[\w.]*/i,
];

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Extract printable ASCII runs (len >= min) from a byte range. */
function printableStrings(bytes: Uint8Array, min = 3): string[] {
    const out: string[] = [];
    let cur = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 0x20 && b <= 0x7e) {
            cur += String.fromCharCode(b);
        } else {
            if (cur.length >= min) out.push(cur);
            cur = '';
        }
    }
    if (cur.length >= min) out.push(cur);
    return out;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
    return s;
}

// ── Container extraction ──────────────────────────────────────────────────────

interface ProvenanceContainers {
    /** Concatenated text from any C2PA/JUMBF box (PNG caBX, JPEG APP11, WebP C2PA). */
    c2paText: string;
    /** Raw XMP packet text if present. */
    xmp: string;
    /** Text from PNG tEXt/iTXt chunks (e.g. Stable Diffusion "parameters"). */
    textChunks: string[];
    /** Raw byte length of the C2PA box (0 when absent). */
    c2paBytes: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(b: Uint8Array): boolean {
    return PNG_SIG.every((v, i) => b[i] === v);
}
function isJpeg(b: Uint8Array): boolean {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
function isWebp(b: Uint8Array): boolean {
    return ascii(b, 0, 4) === 'RIFF' && b.length >= 12 && ascii(b, 8, 4) === 'WEBP';
}

function extractFromPng(b: Uint8Array): ProvenanceContainers {
    const res: ProvenanceContainers = { c2paText: '', xmp: '', textChunks: [], c2paBytes: 0 };
    let pos = 8;
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    while (pos + 8 <= b.length) {
        const len = view.getUint32(pos);
        const type = ascii(b, pos + 4, 4);
        const dataStart = pos + 8;
        const dataEnd = dataStart + len;
        if (dataEnd > b.length) break;
        const data = b.subarray(dataStart, dataEnd);

        if (type === 'caBX') {
            res.c2paText += printableStrings(data).join('\n');
            res.c2paBytes += len;
        } else if (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') {
            const text = ascii(b, dataStart, Math.min(len, data.length));
            if (/xmpmeta|<x:xmpmeta|adobe.xmp/i.test(text)) {
                res.xmp += text;
            } else {
                res.textChunks.push(text);
            }
        } else if (type === 'eXIf') {
            res.textChunks.push(printableStrings(data).join(' '));
        }

        if (type === 'IEND') break;
        pos = dataEnd + 4; // skip CRC
    }
    return res;
}

function extractFromJpeg(b: Uint8Array): ProvenanceContainers {
    const res: ProvenanceContainers = { c2paText: '', xmp: '', textChunks: [], c2paBytes: 0 };
    let pos = 2;
    while (pos + 4 < b.length) {
        if (b[pos] !== 0xff) break;
        const marker = b[pos + 1];
        // Standalone markers (RSTn, SOI, EOI) have no length
        if (marker === 0xd9 || marker === 0xda) break; // EOI or start of scan → done with metadata
        const segLen = (b[pos + 2] << 8) | b[pos + 3];
        const dataStart = pos + 4;
        const dataEnd = pos + 2 + segLen;
        if (dataEnd > b.length) break;
        const seg = b.subarray(dataStart, dataEnd);

        if (marker === 0xeb) {
            // APP11 → JUMBF / C2PA
            res.c2paText += printableStrings(seg).join('\n');
            res.c2paBytes += seg.length;
        } else if (marker === 0xe1) {
            const head = ascii(b, dataStart, Math.min(32, seg.length));
            if (/http:\/\/ns\.adobe\.com\/xap/i.test(head)) {
                res.xmp += ascii(b, dataStart, seg.length);
            } else {
                res.textChunks.push(printableStrings(seg).join(' ')); // EXIF
            }
        } else if (marker >= 0xe2 && marker <= 0xef) {
            const t = printableStrings(seg).join('\n');
            if (/jumb|c2pa/i.test(t)) res.c2paText += t;
        }
        pos = dataEnd;
    }
    return res;
}

function extractFromWebp(b: Uint8Array): ProvenanceContainers {
    const res: ProvenanceContainers = { c2paText: '', xmp: '', textChunks: [], c2paBytes: 0 };
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let pos = 12;
    while (pos + 8 <= b.length) {
        const type = ascii(b, pos, 4);
        const size = view.getUint32(pos + 4, true);
        const dataStart = pos + 8;
        const dataEnd = dataStart + size;
        if (dataEnd > b.length) break;
        const data = b.subarray(dataStart, dataEnd);
        if (type === 'XMP ') {
            res.xmp += ascii(b, dataStart, size);
        } else if (type === 'EXIF') {
            res.textChunks.push(printableStrings(data).join(' '));
        } else if (type === 'C2PA' || /jumb|c2pa/i.test(printableStrings(data.subarray(0, 64)).join(' '))) {
            res.c2paText += printableStrings(data).join('\n');
            res.c2paBytes += size;
        }
        pos = dataEnd + (size % 2); // chunks are padded to even length
    }
    return res;
}

function extractContainers(bytes: Uint8Array): ProvenanceContainers {
    if (isPng(bytes)) return extractFromPng(bytes);
    if (isJpeg(bytes)) return extractFromJpeg(bytes);
    if (isWebp(bytes)) return extractFromWebp(bytes);
    return { c2paText: '', xmp: '', textChunks: [], c2paBytes: 0 };
}

// ── Field extraction from XMP ─────────────────────────────────────────────────

function xmlValue(xmp: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
    const m = xmp.match(re);
    return m ? m[1].trim() : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the AI provenance of the original image bytes. Fully dynamic — the reported
 * platform/model comes from the file, not a fixed assumption.
 */
export function detectAiProvenance(bytes: Uint8Array): AiProvenanceResult {
    const c = extractContainers(bytes);
    const signals: string[] = [];

    // Scoped text used for provider matching: C2PA manifest is authoritative; from XMP we
    // only take generator-ish field values so a plain Adobe XMP namespace doesn't misfire.
    const xmpCreatorTool = c.xmp ? xmlValue(c.xmp, 'xmp:CreatorTool') : null;
    const xmpDigitalSource =
        c.xmp
            ? xmlValue(c.xmp, 'Iptc4xmpExt:DigitalSourceType') ||
              xmlValue(c.xmp, 'photoshop:DigitalSourceType')
            : null;
    const xmpCredit = c.xmp ? xmlValue(c.xmp, 'photoshop:Credit') : null;

    const scopedParts = [
        c.c2paText,
        xmpCreatorTool || '',
        xmpDigitalSource || '',
        xmpCredit || '',
        // Stable-Diffusion-style tools dump a "parameters" tEXt chunk with model info.
        ...c.textChunks.filter((t) => /parameters|stable diffusion|automatic1111|comfyui|model hash|software/i.test(t)),
    ];
    const scoped = scopedParts.join('\n');

    const hasC2pa = c.c2paBytes > 0 || /\bjumbf?\b|\bc2pa\b/i.test(c.c2paText);
    if (hasC2pa) signals.push('C2PA/Content Credentials');

    // digitalSourceType is the strongest single AI signal (IPTC standard).
    let digitalSourceType: string | null = null;
    const dstMatch = scoped.match(/digitalsourcetype\/([A-Za-z]+)/i) || scoped.match(/digitalsourcetype["']?\s*[:=]\s*["']?([A-Za-z]+)/i);
    if (dstMatch) {
        digitalSourceType = dstMatch[1];
    } else if (xmpDigitalSource) {
        const tail = xmpDigitalSource.split('/').pop();
        if (tail) digitalSourceType = tail;
    }
    if (digitalSourceType) signals.push(`digitalSourceType: ${digitalSourceType}`);

    // C2PA action ids. The manifest is CBOR, so raw string runs glue the action id to the
    // next map key (e.g. "c2pa.createddwhen"). Normalise by matching the known action verbs
    // — this also drops assertion labels (icon, signature, claim, hash, certificate).
    const KNOWN_ACTIONS = [
        'created', 'opened', 'placed', 'removed', 'edited', 'converted', 'cropped',
        'resized', 'filtered', 'color_adjustments', 'watermarked', 'published', 'printed',
        'transcoded', 'repackaged', 'redacted', 'dubbed', 'translated', 'managed', 'drawing',
    ];
    const actionsSet = new Set<string>();
    for (const raw of c.c2paText.match(/c2pa\.[a-z_][a-z0-9_.]*/gi) || []) {
        const base = raw.slice('c2pa.'.length).toLowerCase();
        const verb = KNOWN_ACTIONS.find((k) => base.startsWith(k));
        if (!verb) continue;
        // Preserve the meaningful ".unbound"/".bound" qualifier on watermarked.
        if (verb === 'watermarked' && /unbound/.test(base)) actionsSet.add('c2pa.watermarked.unbound');
        else if (verb === 'watermarked' && /\bbound/.test(base)) actionsSet.add('c2pa.watermarked.bound');
        else actionsSet.add(`c2pa.${verb}`);
    }
    const actions = Array.from(actionsSet);

    // Provider match.
    let provider: string | null = null;
    let providerLabel = '';
    for (const sig of PROVIDER_SIGNATURES) {
        if (sig.patterns.some((p) => p.test(scoped))) {
            provider = sig.id;
            providerLabel = sig.label;
            break;
        }
    }

    // Raw claim-generator string (prefer clean human strings from the manifest / XMP).
    let generator: string | null = null;
    if (c.c2paText) {
        const candidates = c.c2paText
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => /(media service|generative|firefly|midjourney|stability|imagen|gemini|openai|gpt-image|c2pa\.org|generator)/i.test(s) && s.length <= 80);
        // Prefer a name-like line over the generic "c2pa.org" tokens.
        generator =
            candidates.find((s) => /media service|generative|firefly|midjourney|imagen|openai/i.test(s)) ||
            candidates[0] ||
            null;
    }
    if (!generator && xmpCreatorTool) generator = xmpCreatorTool;
    if (generator) {
        // Trim a trailing CBOR map-key that got glued onto the string run.
        generator = generator.replace(/d(icon|name|when|title|hashx?|urls?|version)$/i, '').trim();
    }

    // Model + version.
    let model: string | null = null;
    for (const mp of MODEL_PATTERNS) {
        const m = scoped.match(mp);
        if (m) {
            model = m[0].replace(/\s+/g, ' ').trim();
            break;
        }
    }

    // Decide AI-ness and confidence.
    const strongSignal =
        (!!digitalSourceType && /trainedalgorithmic|composite|algorithmicmedia/i.test(digitalSourceType)) ||
        (hasC2pa && actions.some((a) => a === 'c2pa.created' || a.startsWith('c2pa.watermarked'))) ||
        provider !== null;
    const isAiGenerated = strongSignal || hasC2pa || !!digitalSourceType;

    let confidence: AiProvenanceResult['confidence'] = 'low';
    if ((hasC2pa && digitalSourceType) || (provider && digitalSourceType)) confidence = 'high';
    else if (hasC2pa || provider || digitalSourceType) confidence = 'medium';

    if (provider) signals.push(`generator: ${provider}`);
    if (!providerLabel) {
        providerLabel = generator || (digitalSourceType ? 'AI (nền tảng không xác định)' : 'Không phát hiện');
    }

    return {
        isAiGenerated,
        provider,
        providerLabel,
        generator,
        model,
        digitalSourceType,
        actions,
        hasC2pa,
        signals,
        confidence,
    };
}

export interface VerifyResult {
    /** True when no AI-provenance marker remains in the exported bytes. */
    clean: boolean;
    /** Human-readable markers that survived (empty when clean). */
    residual: string[];
}

/**
 * Verify an EXPORTED image is free of AI-provenance markers. Checks specifically for
 * C2PA/JUMBF, IPTC digitalSourceType, and known generator identifiers — NOT generic
 * words like "AI" and NOT our own XMP (which carries only the author's own metadata),
 * so a clean export reports clean.
 */
export function verifyNoProvenance(bytes: Uint8Array): VerifyResult {
    const residual: string[] = [];
    const c = extractContainers(bytes);

    if (c.c2paBytes > 0) residual.push('C2PA manifest (caBX/JUMBF)');
    else if (/\bjumbf?\b.*\bc2pa\b|\bc2pa\.(created|actions|claim|assertions)\b/i.test(c.c2paText)) {
        residual.push('C2PA markers');
    }

    const haystack = [c.c2paText, c.xmp, ...c.textChunks].join('\n');
    if (/digitalsourcetype\/[A-Za-z]/i.test(haystack)) residual.push('IPTC digitalSourceType');

    const generatorTokens = /gpt-image|openai media service|made with google ai|google deepmind|synthid|midjourney|adobe firefly|stable[\s-]?diffusion/i;
    const g = haystack.match(generatorTokens);
    if (g) residual.push(`generator tag: ${g[0]}`);

    return { clean: residual.length === 0, residual: Array.from(new Set(residual)) };
}

/** Convenience: read a Blob/File into bytes for the functions above. */
export async function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
    return new Uint8Array(await blob.arrayBuffer());
}

/** Short, dynamic human summary of a detection result (Vietnamese, for toasts/UI). */
export function describeProvenance(p: AiProvenanceResult): string {
    if (!p.isAiGenerated) return 'Không phát hiện dấu hiệu AI trong metadata.';
    const model = p.model ? ` ${p.model}` : '';
    const dst = p.digitalSourceType ? ` · ${p.digitalSourceType}` : '';
    return `${p.providerLabel}${model}${dst}`;
}
