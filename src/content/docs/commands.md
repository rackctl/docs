---
title: Commands
description: Every rackctl subcommand — init, doctor, upgrade, destroy, version — with flags and behavior.
---

```
rackctl provisions a full nanohype platform from zero — cloud, cluster,
GitOps, controllers, and portal — then hands off to the portal for day-2 ops.

Usage:
  rackctl [command]

Available Commands:
  init        Provision a nanohype platform from zero (full provision, AWS)
  doctor      Check prerequisites and platform health
  upgrade     Upgrade the platform to a newer nanohype release
  destroy     Tear down a provisioned platform (reverse order)
  version     Print the rackctl version
```

All lifecycle commands read a [`rackctl.yaml`](/configuration/) and export
`AWS_PROFILE` and `AWS_REGION` from it before shelling out.

## init

Provisions the platform by walking the [pipeline](/pipeline/) in order.

```sh
rackctl init [flags]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `rackctl.yaml` | Path to the config file. |
| `--apply` | `false` | Provision for real. **Without it, `init` is a dry-run plan.** |
| `--no-clean-on-failure` | `false` | Leave resources in place if a phase fails (default is reverse rollback). |
| `--tui` | `false` | Interactive TUI progress view instead of a scrolling log. |

```sh
# plan
rackctl init -c rackctl.yaml

# provision, watching a live progress view
rackctl init -c rackctl.yaml --apply --tui
```

## doctor

Checks prerequisites and, if a cluster exists, its health. Safe to run anytime.

```sh
rackctl doctor
```

It verifies, in order:

1. The [required tools](/install/#prerequisites) are on your `PATH`.
2. Your AWS identity resolves (`aws sts get-caller-identity`) — otherwise it
   nudges you to `aws sso login`.
3. If a cluster is in your kubeconfig, that it's reachable and that ArgoCD
   applications are present.

## upgrade

Moves the platform to a newer nanohype release.

```sh
rackctl upgrade [-c rackctl.yaml]
```

It pulls the latest eks-gitops addon catalog (`git pull --ff-only`) and bumps the
operator chart (`helm upgrade --install`). ArgoCD then reconciles the catalog to
match.

## destroy

Tears the platform down, running the landing-zone components in the **reverse** of
the order they were applied.

```sh
rackctl destroy [-c rackctl.yaml] [--apply] [--force-buckets]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `rackctl.yaml` | Path to the config file. |
| `--apply` | `false` | Actually destroy. **Without it, `destroy` is a dry-run plan.** |
| `--force-buckets` | `false` | Permit non-empty buckets to be emptied. Two acts — see below. |

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

Two gaps it does **not** cover, both disclosed at runtime rather than papered over:

- **druid outside development.** Its Aurora carries `deletion_protection = true`,
  pinned in the staging and production leaves inside a `map(object)` no `TF_VAR` can
  reach without replacing the leaf's sizing too. rackctl refuses that teardown rather
  than deleting the deepstorage segments and then wedging on `DeleteDBCluster`. Clear
  `deletion_protection` out of band first.
- **eks-agent-platform's `bedrock` and `cost-pipeline` buckets**, which do not accept
  `force_destroy_buckets` at all yet.

:::danger
`destroy --apply` removes cloud resources and is not reversible. Confirm the
account, region, and profile in the printed title before you run it.

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

- **Dry-run is the default** for `init` and `destroy`. Nothing changes in the
  cloud until you pass `--apply`.
- Config is validated before any command does work — see
  [validation](/configuration/#validation).
- Errors and usage are printed cleanly (no cobra stack noise) so failures are easy
  to read in CI logs.
