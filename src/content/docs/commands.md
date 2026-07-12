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
rackctl destroy [-c rackctl.yaml] [--apply]
```

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --config` | `rackctl.yaml` | Path to the config file. |
| `--apply` | `false` | Actually destroy. **Without it, `destroy` is a dry-run plan.** |

Destroy order is `cluster-addons → cluster-bootstrap → secrets → cluster →
network`.

:::danger
`destroy --apply` removes cloud resources and is not reversible. Confirm the
account, region, and profile in the printed title before you run it.
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
