# github-actions-mcp Roadmap

## v0.1.0 - Alpha Release ✓

All core functionality complete:

- [x] GitHub API client with auth
- [x] Permission system (read/trigger/cancel/admin)
- [x] Repository whitelist/blacklist
- [x] NEVERHANG timeouts & circuit breaker
- [x] 10 tools implemented
- [x] Haiku AI fallback for failure diagnosis
- [x] CI workflow (self-testing)
- [x] Documentation

### Tools

| Tool | Status |
|------|--------|
| `gha_list_workflows` | ✓ |
| `gha_get_workflow` | ✓ |
| `gha_list_runs` | ✓ |
| `gha_get_run` | ✓ |
| `gha_get_run_logs` | ✓ |
| `gha_trigger_workflow` | ✓ |
| `gha_rerun_workflow` | ✓ |
| `gha_cancel_run` | ✓ |
| `gha_set_workflow_state` | ✓ |
| `gha_diagnose_failure` | ✓ |

---

## Future

### v0.2.0 - Enhancements
- [ ] Workflow run comparison (diff two runs)
- [ ] Flaky test detection patterns
- [ ] Log search across multiple runs
- [ ] Webhook support for real-time updates

### v1.0.0 - Production
- [ ] GitHub App authentication (org-wide, no PATs)
- [ ] Test suite
- [ ] npm publish (if demand exists)

---

**Status:** v0.1.0 released, CI passing, ready for use.
