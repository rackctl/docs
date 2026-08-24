---
title: Commands
description: Every rackctl subcommand — plan, apply, check, destroy, version — with flags and behavior.
---

```
rackctl provisions a full nanohype platform from zero — cloud, cluster,
GitOps, controllers, and portal — then hands off to the portal for day-2 ops.

Usage:
  rackctl [command]

Available Commands:
  apply       Provision a nanohype platform from zero (AWS)
  check       Check whether an install can succeed, and whether a running platform is healthy
  completion  Generate the autocompletion script for the specified shell
  destroy     Tear down a provisioned platform (reverse order)
  help        Help about any command
  plan        Show what a provision would do, without touching anything
  version     Print the rackctl version

Flags:
  -h, --help   help for rackctl

Use "rackctl [command] --help" for more information about a command.
```

All lifecycle commands read a [`rackctl.yaml`](/configuration/) and resolve an AWS
identity from it before shelling out: `AWS_PROFILE` and `AWS_REGION`, or — when
[`cloud.assumeRole`](/configuration/#cloud) is set — the assumed session's
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` and `AWS_REGION`,
with no `AWS_PROFILE` beside them. A profile left in the environment alongside
explicit credentials is a second answer to the same question.

## plan

Walks the [pipeline](/pipeline/) in order and prints every command a provision would run.
Creates nothing.

It does make read-only AWS calls, and that is the point rather than a side effect: the
sweeps that delete resources outside Terraform's state enumerate for real and show what
they would select. A plan that queried nothing could only restate its own filters back.

```sh
rackctl plan -c rackctl.yaml
```

## apply

Provisions the platform by walking the same pipeline. **This writes, and it spends.**

Re-runnable by design — it is how you retry after a failure and how you re-apply a config
change. It is also the upgrade path: `apply` syncs the catalog fork from upstream and
re-applies, so there is no separate upgrade command. A run that finds the platform already
standing will not tear it down.

The pre-spend half of [`check`](#check) runs first as a gate and refuses to spend when it
fails. `--skip-preflight` is the only way past it. The platform-health half is not part of
the gate — there is no platform to assert anything about yet.

```sh
rackctl apply [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `rackctl.yaml` | Path to the config file. |
| `--no-clean-on-failure` | `false` | Leave resources in place if a phase fails (default is reverse rollback). |
| `--tui` | `false` | Interactive TUI progress view instead of a scrolling log. |
| `--skip-preflight` | `false` | Provision even when the checks say the install cannot succeed. |

```sh
# provision, watching a live progress view
rackctl apply -c rackctl.yaml --tui
```

## check

```sh
rackctl check [flags]
```

Asserts what is knowable right now. With no cluster, the pre-spend set: can this install
succeed at all? With a live cluster, those plus the invariants of a provisioned platform.

One command rather than two, because picking between them correctly required already
knowing whether a cluster exists — which the tool looks up.

Read-only, and exits non-zero, so it gates a deploy.

## destroy

Tears the platform down, running the landing-zone components in the **reverse** of
the order they were applied.

```sh
rackctl destroy [-c rackctl.yaml] [--yes] [--dry-run] [--force-buckets] [--account-scoped]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `rackctl.yaml` | Path to the config file. |
| `--yes` | `false` | Skip the confirmation prompt, for CI and scripted teardowns. |
| `--dry-run` | `false` | Show what would be destroyed and touch nothing. |
| `--force-buckets` | `false` | Permit non-empty buckets to be emptied. Two acts — see below. |
| `--account-scoped` | `false` | Also destroy the account-scoped agent-platform roots (Bedrock invocation logging, the cost pipeline). They are shared by every environment in the account — only for the last one. Pair with `--force-buckets`. |

Teardown runs controller-owned resources first (Platforms, Tenants, NodeClaims,
PVCs — so finalizers release their cloud resources while the controllers are still
alive), then the eks-agent-platform terraform tree, then the landing-zone components
in reverse.

The agent-platform tree comes down **before** landing-zone, not after: its components
resolve landing-zone's SSM parameters through unguarded `data` blocks, and Terraform
evaluates data sources during a destroy plan too — so tearing landing-zone down first
leaves them unable to plan their own teardown.

### `--force-buckets`

Outside `development`, several buckets rackctl creates refuse a destroy while
non-empty. `force_destroy` has no effect until a successful apply has landed it in
state, so permitting a teardown and performing one are necessarily **two acts**:
`--force-buckets` applies the owning components with `force_destroy_buckets=true`,
then destroys.

:::caution[It empties the local restore points]
This deletes the cluster's velero, loki and tempo buckets. The composition upstream
documents as safe — set `velero_backup_policy` first so the central plan copies the
recovery points to the backup account's DR region — is not reachable through rackctl,
which has no field for it and does not apply the `backup` component.
:::

The components it reaches are the ones that declare `force_destroy_buckets`:
`agent-iam` (access logs, model artifacts, eval reports), `cluster-addons` (velero, loki,
tempo, argo-workflows), `model-import` (the staging bucket) and `druid` (the per-tenant
buckets). druid is covered end to end — the permitting apply clears its Aurora
`deletion_protection` in the same act that lands `force_destroy`, so act 2 reaches both
the buckets and the DB cluster.

The eks-agent-platform tree's account-scoped buckets are reachable too, with one more
flag and one caveat, both disclosed at apply time rather than papered over:

- **`--account-scoped` is required** to reach `bedrock-account` and `cost-pipeline` at
  all. `cost-pipeline` takes `force_destroy_buckets`; `bedrock-account` derives
  `force_destroy` from `object_lock_mode != "COMPLIANCE"`, which `live/org` pins to
  GOVERNANCE for exactly this reason. So `rackctl destroy --account-scoped
  --force-buckets` takes them down.
- **Bedrock's invocations bucket carries per-object GOVERNANCE retention**, so that path
  needs `s3:BypassGovernanceRetention` on the caller. rackctl neither declares nor checks
  it.

:::danger
`rackctl destroy` removes cloud resources and is not reversible. Confirm the
account, profile, region and environment in the printed title before you run it:

```
rackctl destroy — acme · 000000000000 · acme-platform · us-west-2 · development
                  org    account        profile        region      environment
```

The account and the profile are the two that decide *which cloud* is about to
change — a region is shared by every account you have.

If this cluster is an **eks-fleet hub** with spoke clusters still vended, `destroy`
refuses. Each spoke is a real EKS cluster — its own control plane, VPC and NAT
gateways, often in another AWS account — and this hub is the only place they are
tracked. Delete them first with
`kubectl delete clusters.fleet.nanohype.dev --all -A --wait` and let Crossplane tear
them down.
:::

## version

```sh
rackctl version
```

Prints the version, set at build time via `-ldflags`.

## Global behavior

- **The verb decides whether anything is written**, and nothing dry-runs by default.
  `plan` is read-only; `apply` writes; `destroy` writes unless `--dry-run` is passed,
  and asks you to type the cluster name first unless `--yes` is.
- Config is validated before any command does work — see
  [validation](/configuration/#validation).
- Errors and usage are printed cleanly (no cobra stack noise) so failures are easy
  to read in CI logs.
