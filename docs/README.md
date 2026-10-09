# Documentation

**New here?** Start with the [user guide](./user-guide.md): what the app does, the roles and what each can do.

For developers and maintainers:

| Doc                               | What it covers                                                        |
| --------------------------------- | --------------------------------------------------------------------- |
| [Product](./product.md)           | Features, roles, account states, protective rules, limits, known gaps |
| [Architecture](./architecture.md) | Workspace, module rules, auth, outbox and worker, failure behaviour   |
| [Domain model](./domain.md)       | Entities, state machines, database invariants                         |
| [HTTP API](./api.md)              | Conventions, errors, pagination, idempotency, endpoint index          |
| [UI conventions](./ui.md)         | Stack, principles, page states, forms, accessibility                  |
| [Development](./development.md)   | Setup, commands, tests, adding a feature, database changes            |
| [Operations](./operations.md)     | Targets, releases, logging, incidents                                 |
| [Decisions](./decisions.md)       | Why the main choices were made, and when to revisit them              |

Elsewhere in the repository:

- [`deploy/README.md`](../deploy/README.md): production setup, releases, backups and restores
- [`ops/`](../ops/README.md): monitoring config and incident runbooks
- [`rbac-permission-matrix.md`](../apps/web/tests/support/rbac-permission-matrix.md): the full role × permission matrix
