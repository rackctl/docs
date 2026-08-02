---
title: Quickstart
description: From an empty AWS account to a running nanohype platform — write a rackctl.yaml, dry-run, then apply.
---

This takes you from an empty AWS account to a running platform. Budget roughly
**45 minutes** of mostly-unattended provisioning for the first apply.

## Before you start

You'll need:

- An AWS account you can administer, reachable through an **AWS SSO (Identity Center) profile**.
- The [prerequisite tools](/install/#prerequisites) on your `PATH`.
- A GitHub account with `gh` authenticated (`gh auth login`) — `rackctl` forks the platform repos into your org.

  `gh auth login` is enough on its own. If you set `org.gitops.tenantsRepo` (which
  `controlPlane.portal` requires), `rackctl` also registers a read-only deploy key on that
  repo, and the Terraform GitHub provider that does it reads **`GITHUB_TOKEN`** — a
  variable `gh auth login` never exports, because it stores the credential in `gh`'s own
  keyring. `rackctl` bridges the gap by asking `gh` for the token at apply time, so the
  `gh auth login` path works as written. Your login needs **`repo` scope** for the deploy
  key to register. If you'd rather be explicit, export it yourself and `rackctl` uses that
  instead:

  ```sh
  export GITHUB_TOKEN=$(gh auth token)
  ```

Confirm your environment first:

```sh
aws sso login --profile workload-dev
rackctl check
```

`doctor` checks the tools are present and that your AWS identity resolves. Fix
anything it flags before continuing.

`rackctl apply` additionally runs a **preflight** gate that refuses to start when the
install could not succeed — including a missing GitHub credential when your config needs
one. It checks before spending anything, rather than failing an hour in.

## 1. Write a `rackctl.yaml`

This is the whole platform as one declarative document. Start from the minimum and
grow it — unset fields take [sensible dev defaults](/configuration/#defaults).

```yaml title="rackctl.yaml"
org:
  name: acme
  gitops:
    eksGitopsRepo: github.com/acme/eks-gitops   # your fork of nanohype/eks-gitops

cloud:
  provider: aws
  accountId: "111111111111"
  region: us-west-2
  profile: workload-dev          # AWS SSO profile

environment: dev

agentPlatform:
  enable: true
  bedrockModelFamilies: [anthropic, amazon-nova]

# optional smoke test — provisions a throwaway first tenant
firstTenant:
  name: blank
  persona: generic
  tenant: example
  monthlyBudgetUsd: 100
```

The [configuration reference](/configuration/) documents every field. A fuller
example lives in the repo at
[`examples/rackctl.yaml`](https://github.com/rackctl/rackctl/blob/main/examples/rackctl.yaml).

## 2. Dry-run

`rackctl plan` prints every phase and the commands a provision would run, and touches
nothing in the cloud. It does make read-only AWS calls — that is how the destructive
sweeps show you what they would select rather than restating their own filters.

```sh
rackctl plan -c rackctl.yaml
```

Read the plan. This is your chance to catch a wrong account id, region, or profile
before anything is created.

Want to watch it as a live progress view instead of a scrolling log?

```sh
rackctl apply -c rackctl.yaml --tui
```

## 3. Apply

When the plan looks right, provision for real:

```sh
rackctl apply -c rackctl.yaml
```

`rackctl` walks the [pipeline](/pipeline/) in order. If a phase fails, it rolls the
completed phases back in reverse — unless you pass `--no-clean-on-failure` to leave
resources in place for debugging.

## 4. Confirm

```sh
rackctl check
```

Once the cluster is up, `doctor` also checks it's reachable and that ArgoCD
applications are present and syncing.

## 5. Hand off

From here, day-2 operations move to the portal (enable it with
`controlPlane.portal: true`). `rackctl` stays for lifecycle:

- [`rackctl apply`](/commands/#apply) — re-runnable: it syncs the catalog fork and re-applies, so it is also the upgrade path.
- [`rackctl destroy`](/commands/#destroy) — tear the platform down in reverse.

## Next

- [Configuration](/configuration/) — the full `rackctl.yaml` schema.
- [Footguns](/footguns/) — the sharp edges worth knowing before a production run.
