# Security Policy

## Supported Versions

The NIT Arunachal Pradesh Alumni Network is a single hosted service, not a versioned library. Security fixes go
to `main` and ship to production through the normal release path. Older commits and self-hosted forks get no
fixes.

| Version                         | Supported          |
| ------------------------------- | ------------------ |
| Production deployment           | :white_check_mark: |
| `main` branch                   | :white_check_mark: |
| Older commits, forks, snapshots | :x:                |

## Reporting a Vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub:
[Report a vulnerability](https://github.com/coding-pundit-nitap/alumini/security/advisories/new) (Security tab →
"Report a vulnerability").

Please include:

- what is affected (page, API route under `/api/v1`, worker job, deployment config)
- steps to reproduce or a proof of concept
- the impact you expect, such as reading another member's data, privilege escalation or bypassing verification
- your name or handle if you want credit

### What to expect

- **Acknowledgement** within 3 working days.
- **Initial assessment** within 7 working days. We will tell you whether we accept the report and how severe
  we think it is.
- **Updates** at least every 14 days on the advisory thread until it is resolved.
- **If accepted:** we fix it on `main` and deploy it through staging to production, then publish a GitHub
  Security Advisory. We credit you there unless you ask us not to. If member data may have been exposed, we
  also notify affected members.
- **If declined:** we explain why on the advisory thread, for example that it is out of scope, cannot be
  reproduced or is expected behaviour.

Please give us a reasonable chance to fix the problem before you disclose it publicly. We aim to resolve
critical issues within 30 days.

### Scope

In scope: the code in this repository and the production service it runs.

Out of scope:

- denial-of-service or volumetric testing against production
- social engineering, phishing or physical attacks on staff, students or alumni
- findings that need a compromised device or browser
- vulnerabilities in third-party services or dependencies with no demonstrated impact here. Report those
  upstream.
- missing best-practice headers or settings with no demonstrated impact

### Safe harbour

We will not take action against good-faith research that follows this policy. That means you:

- test only against accounts you own, or against a local instance (see [Development](./docs/development.md))
- do not access, change or keep other members' data beyond what is needed to show the issue
- stop and report as soon as you find exposed personal data
