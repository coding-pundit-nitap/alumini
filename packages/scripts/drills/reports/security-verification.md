# Security Verification

## 3. Scanners and drills

| What                    | Where                                                          | Gate                 | Last result (2026-10-02)                                    |
| ----------------------- | -------------------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Secret scan, history    | gitleaks (CI `secret-scan`)                                    | blocks               | 517 commits: 1 false positive, triaged in `.gitleaksignore` |
| Secret scan, pre-commit | `packages/scripts/security/secret-scan-staged.sh`              | blocks locally       | staged AWS key refused (checked)                            |
| Dependency audit        | `pnpm audit --audit-level high` (CI), all levels (nightly)     | blocks high/critical | clean after next 16.3.6                                     |
| SAST                    | Semgrep (CI `sast`)                                            | blocks ERROR         | 0 findings; rule fixtures 6/6                               |
| Dockerfile lint         | hadolint (CI `images`)                                         | blocks error         | clean                                                       |
| Image scan              | Trivy (CI `images`)                                            | blocks CRITICAL      | web and worker: 0 CRITICAL, 0 HIGH                          |
| Client bundle           | `packages/scripts/security/scan-client-bundle.ts` (CI `build`) | blocks               | 17 names, 6 secret values: none in `.next/static`           |
| DAST                    | ZAP baseline (nightly)                                         | report               | 0 fail, 62 pass; credentials-in-URL fixed                   |
| Malware scan drill      | `packages/scripts/drills/clamav-eicar.ts` (`pnpm docker:scan`) | drill                | **pending**: run against a real clamd                       |
