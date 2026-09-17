import { describe, it, expect } from 'vitest';
import { detectAiProvenance, verifyNoProvenance, describeProvenance } from '../src/lib/aiProvenance';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Build a minimal PNG: signature + IHDR + optional extra chunks + IEND. */
function buildPng(chunks: Array<{ type: string; data: Uint8Array }>): Uint8Array {
    const parts: number[] = [...PNG_SIG];

    const pushChunk = (type: string, data: Uint8Array) => {
        const len = data.length;
        parts.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
        for (const ch of type) parts.push(ch.charCodeAt(0));
        parts.push(...data);
        parts.push(0, 0, 0, 0); // dummy CRC (parser does not validate it)
    };

    // IHDR (13 bytes, contents irrelevant to the metadata parser)
    pushChunk('IHDR', new Uint8Array(13));
    for (const c of chunks) pushChunk(c.type, c.data);
    pushChunk('IEND', new Uint8Array(0));

    return new Uint8Array(parts);
}

function caBX(text: string): { type: string; data: Uint8Array } {
    return { type: 'caBX', data: new TextEncoder().encode(text) };
}

describe('detectAiProvenance', () => {
    it('detects OpenAI gpt-image from a C2PA caBX manifest', () => {
        const png = buildPng([
            caBX('jumdc2pa OpenAI Media Service API gpt-image version 2.0 ' +
                'digitalsourcetype/trainedAlgorithmicMedia c2pa.created c2pa.converted c2pa.watermarked.unbound'),
        ]);
        const r = detectAiProvenance(png);
        expect(r.isAiGenerated).toBe(true);
        expect(r.provider).toBe('OpenAI');
        expect(r.digitalSourceType).toBe('trainedAlgorithmicMedia');
        expect(r.hasC2pa).toBe(true);
        expect(r.confidence).toBe('high');
        expect(r.actions).toContain('c2pa.created');
        expect(r.actions).toContain('c2pa.watermarked.unbound');
        // Assertion labels must NOT leak in as actions
        expect(r.actions).not.toContain('c2pa.icon');
    });

    it('detects Google/Imagen dynamically (not hardcoded to OpenAI)', () => {
        const png = buildPng([
            caBX('jumdc2pa Made with Google AI Imagen 3 digitalsourcetype/trainedAlgorithmicMedia c2pa.created'),
        ]);
        const r = detectAiProvenance(png);
        expect(r.provider).toBe('Google');
        expect(r.providerLabel).toMatch(/Google/);
    });

    it('reports unknown generator when no signature matches but AI markers exist', () => {
        const png = buildPng([
            caBX('jumdc2pa SomeNewModel v9 digitalsourcetype/trainedAlgorithmicMedia c2pa.created'),
        ]);
        const r = detectAiProvenance(png);
        expect(r.isAiGenerated).toBe(true);
        expect(r.provider).toBeNull();
        expect(r.digitalSourceType).toBe('trainedAlgorithmicMedia');
    });

    it('returns not-AI for a clean PNG with no provenance', () => {
        const png = buildPng([]);
        const r = detectAiProvenance(png);
        expect(r.isAiGenerated).toBe(false);
        expect(r.provider).toBeNull();
        expect(describeProvenance(r)).toMatch(/Không phát hiện/);
    });
});

describe('verifyNoProvenance', () => {
    it('flags residual C2PA/digitalSourceType/generator in a dirty file', () => {
        const png = buildPng([
            caBX('jumdc2pa gpt-image digitalsourcetype/trainedAlgorithmicMedia c2pa.created'),
        ]);
        const v = verifyNoProvenance(png);
        expect(v.clean).toBe(false);
        expect(v.residual.length).toBeGreaterThan(0);
    });

    it('reports clean once provenance chunks are removed', () => {
        const clean = buildPng([]);
        const v = verifyNoProvenance(clean);
        expect(v.clean).toBe(true);
        expect(v.residual).toHaveLength(0);
    });

    it('does not false-positive on unrelated descriptive XMP metadata', () => {
        // Descriptive metadata (dc:creator etc.) must not be mistaken for AI provenance.
        const ownXmp =
            '<?xpacket begin="" ?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
            '<rdf:RDF><rdf:Description><dc:creator>Sample Creator</dc:creator>' +
            '<xmp:CreatorTool>Example Image Editor</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta>';
        const png = buildPng([{ type: 'iTXt', data: new TextEncoder().encode('XML:com.adobe.xmp\0\0\0\0' + ownXmp) }]);
        const v = verifyNoProvenance(png);
        expect(v.clean).toBe(true);
    });
});
