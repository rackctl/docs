---
title: Footguns
description: The sharp edges of a real full-provision — read these before your first apply.
---

`rackctl` provisions real, billable infrastructure against your own AWS account.
These are the edges worth knowing before your first `--apply`. Most are caught by
[validation](/configuration/#validation) or [`doctor`](/commands/#doctor) — a few
are just the physics of provisioning a cloud.

## 1. Dry-run is the default — and so is *nothing happening*

`rackctl init` and `rackctl destroy` are **plans** until you add `--apply`. If you
expected resources and got none, you probably omitted `--apply`. Conversely: never
paste `--apply` into a command you haven't read the plan for.

## 2. Production forbids a public API endpoint

`environment: production` with `cluster.endpointPublicAccess: true` fails
validation. Production clusters must have a private endpoint — which means you need
a **bastion or VPN** to reach the API server. Plan that access path *before* you
provision prod, or you'll strand yourself outside your own cluster.

## 3. Quota requests are filed, not granted

`quotas.autoRequest: true` **files** increases (e.g. `L-1216C47A`, EC2 on-demand
vCPU) — it can't approve them. AWS approval ranges from minutes to hours to a
support conversation. If the cluster phase stalls on capacity, an unapproved quota
is the usual cause. File early; check the Service Quotas console.

## 4. The account id must match your identity

`cloud.accountId` must be exactly 12 digits **and** match the account your AWS
profile actually resolves to. Preflight compares them and stops if they differ — a
guard against provisioning into the wrong account. Run `aws sso login` for the
right profile first.

## 5. Opt-in layers need their repos

Enabling a control-plane layer without its GitOps backing repo fails validation:

- `controlPlane.eksFleet: true` requires `org.gitops.clustersRepo`.
- `controlPlane.portal: true` requires `org.gitops.tenantsRepo`.

Set the repo alongside the flag, not after.

## 6. Bedrock model access is account-gated

`agentPlatform.bedrockModelFamilies` assumes those families are **enabled in your
account and region**. Bedrock model access is granted per-account in the console;
rackctl can't grant it for you. Enable the families you list before provisioning,
or the agent platform will come up without the models it expects.

## 7. `destroy` is reverse and irreversible

`rackctl destroy --apply` removes cloud resources in the reverse of the apply
order. There's no undo. The command prints the org, region, and environment in its
title — read that line before you confirm. When in doubt, run it without `--apply`
first and read the plan.

## 8. Rollback can leave a partial state

If an `init` phase fails, the engine rolls back completed phases in reverse — but a
teardown step can itself fail (a stuck finalizer, a dependency still in use). If
that happens, the safest recovery is to fix the blocker and re-run, or
`rackctl destroy` to clear the account. Use `--no-clean-on-failure` when you'd
rather inspect the wreckage than have it cleaned up.

## See also

- [Configuration → Validation](/configuration/#validation) — the rules that catch most of these up front.
- [Runbook](/runbook/) — the calm, ordered way to run a provision.
