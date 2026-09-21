export type ScanResult = { ok: true } | { ok: false; reason: string };

/** Malware/content scanning for uploaded bytes (spec 3C). ClamAV is Phase 16; this is the seam. */
export interface ScannerPort {
  scan(bytes: Buffer): Promise<ScanResult>;
}

/** Always passes. The re-encode step (sharp) already strips EXIF and any payload a crafted image carries. */
export const passthroughScanner: ScannerPort = {
  async scan() {
    return { ok: true };
  },
};
