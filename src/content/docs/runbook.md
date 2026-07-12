---
title: Runbook
description: The calm, ordered way to run a provision — preflight, plan, apply, verify, hand off — plus troubleshooting.
---

A provision is unattended for most of its ~45 minutes, but the first ten are worth
doing deliberately. This is the sequence.

## 1. Preflight

```sh
aws sso login --profile <your-profile>
rackctl doctor
```

`doctor` confirms the tools are present and your AWS identity resolves. Don't
proceed until it's clean — every downstream phase assumes both.

## 2. Review the config

Open your [`rackctl.yaml`](/configuration/) and check the three things that hurt
most when wrong:

- `cloud.accountId` — the exact 12-digit account you intend.
- `cloud.region` — where everything lands.
- `environment` — and, for `production`, that `cluster.endpointPublicAccess` is `false`.

## 3. Plan

```sh
rackctl init -c rackctl.yaml
```

Read it. The plan lists every phase and the commands it will run. This is the last
checkpoint before real resources exist. If anything looks off — a wrong repo, an
unexpected addon — stop and fix the config, not the running provision.

## 4. Apply

```sh
rackctl init -c rackctl.yaml --apply --tui
```

`--tui` gives a live progress view. Let it run. The long poles are the cluster
phase (EKS control plane creation) and addon convergence (ArgoCD reconciling the
catalog). If it stalls in the cluster phase, check [quotas](/footguns/#3-quota-requests-are-filed-not-granted).

If a phase fails, the engine rolls back completed phases in reverse. To stop that
and inspect the state instead:

```sh
rackctl init -c rackctl.yaml --apply --no-clean-on-failure
```

## 5. Verify

```sh
rackctl doctor
```

With a cluster up, `doctor` also checks it's reachable and that ArgoCD applications
are present and syncing. Then spot-check directly:

```sh
kubectl get nodes
kubectl -n argocd get applications
```

## 6. Hand off

Core platform is up and reconciling. Day-2 work moves to the portal (enable it with
`controlPlane.portal: true`). `rackctl` stays for lifecycle only.

## Ongoing

### Upgrade

```sh
rackctl upgrade -c rackctl.yaml
```

Pulls the latest addon catalog and bumps the operator; ArgoCD reconciles the rest.

### Tear down

```sh
rackctl destroy -c rackctl.yaml            # plan
rackctl destroy -c rackctl.yaml --apply    # reverse teardown
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `doctor` reports missing tools | A prerequisite isn't on `PATH` | [Install it](/install/#prerequisites) |
| `aws identity unavailable` | SSO session expired | `aws sso login --profile <profile>` |
| Preflight stops on account mismatch | `cloud.accountId` ≠ resolved account | Fix the id or switch profiles |
| Cluster phase hangs on capacity | Unapproved vCPU quota | Check Service Quotas; wait for the increase |
| Agent platform up but models missing | Bedrock family not enabled | Enable it in the Bedrock console for the region |
| Invalid config before any work | A [validation rule](/configuration/#validation) failed | Read the error — all failures are listed at once |
| Rollback itself fails | Stuck finalizer / dependency in use | Clear the blocker, then re-run or `rackctl destroy` |

## See also

- [Footguns](/footguns/) — the failure modes behind this table.
- [The pipeline](/pipeline/) — what each phase actually does.
