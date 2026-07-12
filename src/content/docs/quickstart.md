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

Confirm your environment first:

```sh
aws sso login --profile workload-dev
rackctl doctor
```

`doctor` checks the tools are present and that your AWS identity resolves. Fix
anything it flags before continuing.

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

`init` is a **plan by default** — it prints every phase and the commands it would
run, and touches nothing in the cloud.

```sh
rackctl init -c rackctl.yaml
```

Read the plan. This is your chance to catch a wrong account id, region, or profile
before anything is created.

Want to watch it as a live progress view instead of a scrolling log?

```sh
rackctl init -c rackctl.yaml --tui
```

## 3. Apply

When the plan looks right, provision for real:

```sh
rackctl init -c rackctl.yaml --apply
```

`rackctl` walks the [pipeline](/pipeline/) in order. If a phase fails, it rolls the
completed phases back in reverse — unless you pass `--no-clean-on-failure` to leave
resources in place for debugging.

## 4. Confirm

```sh
rackctl doctor
```

Once the cluster is up, `doctor` also checks it's reachable and that ArgoCD
applications are present and syncing.

## 5. Hand off

From here, day-2 operations move to the portal (enable it with
`controlPlane.portal: true`). `rackctl` stays for lifecycle:

- [`rackctl upgrade`](/commands/#upgrade) — pull the latest addon catalog and bump the operator.
- [`rackctl destroy`](/commands/#destroy) — tear the platform down in reverse.

## Next

- [Configuration](/configuration/) — the full `rackctl.yaml` schema.
- [Footguns](/footguns/) — the sharp edges worth knowing before a production run.
