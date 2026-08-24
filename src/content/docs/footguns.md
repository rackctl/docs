---
title: Footguns
description: The sharp edges of a real full-provision — read these before your first apply.
---

`rackctl` provisions real, billable infrastructure against your own AWS account.
These are the edges worth knowing before your first `rackctl apply`. Most are caught by
[validation](/configuration/#validation) or [`check`](/commands/#check) — a few
are just the physics of provisioning a cloud.

## 1. The verb decides whether anything is written

`rackctl plan` is read-only. `rackctl apply` provisions and spends. `rackctl destroy`
tears down and asks you to type the cluster name first — unless you pass `--yes`, which
skips the prompt for CI and scripted teardowns.

There is no mode flag: the intent is the verb, at the front of the line where it is read,
rather than five characters at the end that make the dangerous command look almost exactly
like the harmless one.

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

`cloud.accountId` must be 12 characters long — validation checks the length, nothing
more — and must match the account your AWS profile actually resolves to. Both `rackctl
check` and the preflight phase compare it against `sts get-caller-identity` and stop if
they differ, which is the guard against provisioning into the wrong account. Run
`aws sso login` for the right profile first.

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

`rackctl destroy` removes cloud resources in the reverse of the apply order. There's no
undo. The command prints the org, **account id**, **profile**, region and environment in
its title — the account and the profile are the two that decide *which cloud* is about to
change, since a region is shared by every account you have. Read that line before you
confirm. When in doubt, run it with `--dry-run` first and read the plan.

## 8. Rollback is the exception, not the rule

Reading "a failed phase rolls back" as unconditional is the sharpest edge on this page,
because it is wrong in both directions: it makes a re-apply look dangerous when it is not,
and a failed optional phase look cleaned up when it is standing and billing.

When it *does* roll back, it tears down every completed phase **and the phase that just
failed**, in reverse. Including the failing phase is deliberate — a phase that dies partway
has usually already created resources, and rolling back only the successes is what left
seven IAM roles behind after a failed `cluster-addons`.

It does not roll back at all in four cases:

- **The failed phase is optional** — `fleet`, `portal` or `smoke`. Nothing is torn down,
  the remaining phases still run, and the run exits non-zero at the end naming them. For
  `smoke` the alternative is perverse: the check would destroy the thing it was checking,
  and you would lose both the platform and the evidence.
- **The platform was already standing**, or rackctl could not determine whether it was.
  `rackctl apply` is re-runnable by design; against an existing cluster the early phases
  succeed as no-ops and are recorded as completed, and rolling those back would destroy a
  healthy VPC and EKS control plane this run did not build. The probe fails **closed**, so
  an expired credential mid-run disables rollback rather than arming it.
- **The failure declares itself un-rollbackable** — a failure to converge rather than to
  provision. ArgoCD not settling inside 30 minutes is the cluster's problem, not the
  cloud's, and destroying the cloud removes the only surface it can be diagnosed on.
- **`--no-clean-on-failure` was passed**, when you would rather inspect the wreckage.

A teardown step can also fail on its own (a stuck finalizer, a dependency still in use).
Then the safest recovery is to fix the blocker and re-run, or `rackctl destroy` to clear
the account.

## See also

- [Configuration → Validation](/configuration/#validation) — the rules that catch most of these up front.
- [Runbook](/runbook/) — the calm, ordered way to run a provision.
