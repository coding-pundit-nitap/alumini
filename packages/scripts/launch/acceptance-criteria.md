<!-- Acceptance criteria checked by packages/scripts/launch-check.ts: every box below needs a row in launch-readiness.md. -->

# 50. Acceptance Criteria

The MVP shall not be considered production-ready until:

### Authentication

- [ ] Registration works
- [ ] Verification works
- [ ] Password recovery works
- [ ] Unauthorized access is rejected

### Profiles

- [ ] Alumni profiles work
- [ ] Student profiles work
- [ ] Privacy controls work
- [ ] Institutional information is protected

### Directory

- [ ] Search works
- [ ] Filtering works
- [ ] Pagination works
- [ ] Unauthorized information is hidden

### Networking

- [ ] Connection requests work
- [ ] Duplicate connections are impossible
- [ ] Blocking works

### Mentorship

- [ ] Mentor discovery works
- [ ] Requests work
- [ ] State transitions are correct

### Jobs

- [ ] Job creation works
- [ ] Moderation works
- [ ] Expiration works

### Events

- [ ] Creation works
- [ ] Registration works
- [ ] Capacity is enforced under concurrency

### Administration

- [ ] RBAC works
- [ ] Moderation works
- [ ] Audit logs work

### Reliability

- [ ] Backups work
- [ ] Restore has been tested
- [ ] Health checks work
- [ ] Background jobs retry correctly
- [ ] Critical operations are transactional

### Observability

- [ ] Structured logs
- [ ] Metrics
- [ ] Error tracking
- [ ] Request IDs
- [ ] Alerts for critical failures

### Delivery

- [ ] CI passes
- [ ] Automated tests pass
- [ ] Database migrations are versioned
- [ ] Production rollback procedure exists

---
