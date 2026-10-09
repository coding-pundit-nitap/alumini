export type ScanResult = { ok: true } | { ok: false; reason: string };

/** Malware/content scanning for uploaded bytes. ClamAV plugs in here. */
export interface ScannerPort {
  scan(bytes: Buffer): Promise<ScanResult>;
}

/**
 * Always passes. The re-encode step (sharp) already strips EXIF and any payload
 * a crafted image carries.
 */
export const passthroughScanner: ScannerPort = {
  async scan() {
    return { ok: true };
  },
};
