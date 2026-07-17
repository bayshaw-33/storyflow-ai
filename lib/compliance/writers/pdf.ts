/**
 * PDF metadata writer (pdf-lib based).
 *
 * Sets Info-dictionary entries: Producer / Creator / Title / Subject plus
 * Keywords carrying the FULL canonical JSON manifest as a single keyword
 * entry. A low-level custom Info entry `KIIManifest` is also written on a
 * best-effort basis via pdf-lib's object model (context.trailerInfo) — if
 * the internals ever change, Keywords alone remains the compliant carrier
 * (see verifier fallback). XMP metadata-stream writing is intentionally
 * NOT implemented in Phase 0 (optional per plan). Throws PDF_MARKING_FAILED.
 */

import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

import { canonicalJson } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

const PRODUCER = "KIIKIS StoryFlow Compliance Adapter 0.1";
const CREATOR = "KIIKIS StoryFlow";

export async function writePdf(
  inputBytes: Uint8Array,
  manifest: AiManifest,
  _request: MarkingRequest,
): Promise<FormatWriteResult> {
  try {
    // updateMetadata:false at LOAD time keeps our Producer/Keywords — pdf-lib
    // would otherwise stamp its own Producer when constructing the document
    // (it is a load/create option; XMP stream writing not used in Phase 0).
    const doc = await PDFDocument.load(inputBytes, { updateMetadata: false });
    doc.setProducer(PRODUCER);
    doc.setCreator(CREATOR);
    doc.setTitle(`AI-marked export ${manifest.asset_id}`);
    doc.setSubject("AI-generated content disclosure (EU AI Act Art.50 / CN AIGC labeling rules)");
    const json = canonicalJson(manifest);
    // Single keyword entry carries the FULL canonical JSON manifest.
    doc.setKeywords([json]);
    // Best-effort low-level custom Info entry KIIManifest. If pdf-lib
    // internals shift, skip silently and rely on Keywords (documented).
    try {
      const infoRef = doc.context.trailerInfo.Info;
      const infoDict = infoRef ? doc.context.lookup(infoRef) : undefined;
      if (infoDict instanceof PDFDict) {
        infoDict.set(PDFName.of("KIIManifest"), PDFString.of(json));
      }
    } catch {
      // optional: Keywords is the canonical carrier; see note above
    }
    const outputBytes = await doc.save();
    return {
      outputBytes: new Uint8Array(outputBytes),
      machineReadableFormats: ["pdf-info-dict"],
      extraVerification: { producer: PRODUCER },
    };
  } catch (error) {
    throw new Error(`PDF_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function verifyPdf(outputBytes: Uint8Array): Promise<FormatVerifyResult> {
  let doc: PDFDocument;
  try {
    // updateMetadata:false so loading does not re-stamp Producer in memory
    doc = await PDFDocument.load(outputBytes, { updateMetadata: false });
  } catch (error) {
    return { found: false, detail: error instanceof Error ? error.message : String(error) };
  }
  const keywords = doc.getKeywords() ?? "";
  if (keywords) {
    try {
      return {
        found: true,
        extractedManifest: JSON.parse(keywords) as Record<string, unknown>,
        detail: `pdf-info-dict; producer=${doc.getProducer() ?? ""}`,
      };
    } catch {
      // fall through to the custom entry below
    }
  }
  try {
    const infoRef = doc.context.trailerInfo.Info;
    const infoDict = infoRef ? doc.context.lookup(infoRef) : undefined;
    if (infoDict instanceof PDFDict) {
      const raw = infoDict.get(PDFName.of("KIIManifest"));
      if (raw instanceof PDFString) {
        return {
          found: true,
          extractedManifest: JSON.parse(raw.decodeText()) as Record<string, unknown>,
          detail: "pdf-info-dict-custom",
        };
      }
    }
  } catch {
    // ignored — reported as not found below
  }
  return { found: false, detail: "no kiikis manifest in PDF Info dictionary" };
}
