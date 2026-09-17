/**
 * Detector result contracts.
 *
 * Provenance and pixel-comparison evidence are represented separately from
 * the raw metadata parser. Both layers may read the same source image bytes.
 *
 * Every field here exists to keep the UI honest per
 * product guardrails: no field implies an absolute
 * verdict, and absence of a signal is never surfaced as proof of anything.
 */

/** Never "certain" — the product does not claim certainty at any level. */
export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

/**
 * Which analysis layer produced a piece of evidence. `visual-pixel` is
 * reserved for a future detector and is not produced by the current app.
 */
export type SignalSource = "metadata-provenance" | "visual-pixel";

export interface SignalEvidence {
  source: SignalSource;
  /** Short, human-readable line describing the signal (Vietnamese). */
  label: string;
  /** Optional extra detail (raw generator string, action ids, matched containers, ...). */
  detail?: string;
}

export interface DetectionResult {
  /** Whether at least one signal was found. Never rendered as "AI" vs "người". */
  hasAiSignal: boolean;
  confidence: ConfidenceBand;
  evidence: SignalEvidence[];
  /** Always shown to the user next to the result — required by PDR §3/§7. */
  caveat: string;
  /** Which signal source(s) actually ran for this check. */
  signalsChecked: SignalSource[];
  /** String inspection is not signature validation or a calibrated probability. */
  provenance?: {
    c2pa: "present-unverified" | "not-found";
    signatureVerified: false;
    aiDisclosure: "generated" | "edited" | "unspecified" | "none";
  };
}
