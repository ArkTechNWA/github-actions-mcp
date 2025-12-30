# github-actions-mcp Roadmap

## Phase 0: Foundation ✓
- [x] README.md with spec
- [x] ROADMAP.md
- [ ] LICENSE, package.json, tsconfig
- [ ] Example configs

## Phase 1: Read-Only Core
- [ ] GitHub API client with auth
- [ ] `gha_list_workflows`
- [ ] `gha_list_runs`
- [ ] `gha_get_run`
- [ ] NEVERHANG timeouts

## Phase 2: Logs
- [ ] `gha_get_run_logs`
- [ ] Log streaming/chunking
- [ ] Grep filtering
- [ ] Job/step targeting

## Phase 3: Permission System
- [ ] Permission levels (read, trigger, cancel, admin)
- [ ] Repository whitelist/blacklist
- [ ] `--bypass-permissions` flag
- [ ] Config file loading

## Phase 4: Actions
- [ ] `gha_trigger_workflow`
- [ ] `gha_rerun_workflow`
- [ ] `gha_cancel_run`
- [ ] `gha_set_workflow_state`

## Phase 5: Rate Limit & Resilience
- [ ] Rate limit tracking
- [ ] Backoff on 403/429
- [ ] Circuit breaker
- [ ] Graceful degradation

## Phase 6: AI Analysis
- [ ] `gha_diagnose_failure`
- [ ] Haiku integration
- [ ] Log pattern analysis

## Phase 7: Polish
- [ ] Error messages
- [ ] Test suite
- [ ] npm publish

---

| Version | Phase | Description |
|---------|-------|-------------|
| 0.1.0 | 1 | Read-only workflows/runs |
| 0.2.0 | 2 | Log access |
| 0.3.0 | 3 | Permission system |
| 0.4.0 | 4 | Trigger/cancel actions |
| 0.5.0 | 5 | Rate limiting |
| 0.6.0 | 6 | AI diagnosis |
| 1.0.0 | 7 | Production release |
