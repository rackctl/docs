---
title: The pipeline
description: The ordered 0→running bootstrap rackctl walks — ten phases, what each does, and how rollback works.
---

`rackctl apply` walks an ordered pipeline. Phases 0–6 are the core 0→running path
(AWS-only, v1); phases 7–9 are opt-in layers you turn on in
[`rackctl.yaml`](/configuration/#controlplane). Each phase orchestrates the
existing nanohype repos — landing-zone (Terragrunt), eks-gitops (ArgoCD catalog),
and eks-agent-platform (operator). rackctl is the glue that automates
`landing-zone/docs/first-deploy-aws.md`; it is not a rewrite.

## The phases

| # | ID | Title | Gate |
|---|-----|-------|------|
| 0 | `preflight` | Preflight — tools, identity, quotas | always |
| 1 | `acquire` | Acquire platform repos (clone + fork) | always |
| 2 | `identity` | Identity & Terraform state backend | always |
| 3 | `cluster` | Network & EKS cluster | always |
| 4 | `substrate` | AWS substrate — IAM, Pod Identity, buckets, monitoring | always |
| 5 | `gitops` | ArgoCD GitOps & addon convergence | always |
| 6 | `platform` | Agent-platform substrate, CRDs & operator | always |
| 7 | `fleet` | Cluster control plane (eks-fleet) | `controlPlane.eksFleet` |
| 8 | `portal` | Operator portal (day-2 UI) | `controlPlane.portal` |
| 9 | `smoke` | First-tenant smoke test | `firstTenant` is set |

### 0 · Preflight

Confirms the [required tools](/install/#prerequisites) are present, that your AWS
identity resolves and matches `cloud.accountId`, and — when `quotas.autoRequest` is
on — files any needed service quota increases before anything is provisioned.

### 1 · Acquire

Clones `landing-zone` and `eks-agent-platform` from nanohype, forks `eks-gitops` into
your org and clones the fork — that fork is the catalog ArgoCD reads — and clones
`portal` and `eks-fleet` when their layers are enabled. Everything lands under
`~/.rackctl/<org>/`.

It ends by asserting that every landing-zone component this config will apply has a live
Terragrunt root in the tree it just cloned. That is the last moment before anything is
provisioned at which a missing root costs nothing.

### 2 · Identity

Creates the Terraform/OpenTofu remote state backend the landing-zone components use —
a versioned, encrypted, public-access-blocked S3 bucket named
`<account>-<region>-tfstate`.

### 3 · Cluster

Applies the `network` and `cluster` landing-zone components — the VPC and the EKS
control plane and system node group.

### 4 · Substrate

Everything ArgoCD will read must exist before ArgoCD does, and this phase builds all of
it: `secrets`, then the gated `agent-iam`, `managed-monitoring`, `observability`,
`druid`, `dns`, `model-import`, `fleet-hub` and `tenant-substrate`, then `cluster-addons`.
IAM, Pod Identity associations, S3 buckets, KMS, the AMP/AMG workspaces and their SSM
parameters.

It then performs the **IRSA account-id writeback** — stamping this account's id into the
`eks-gitops` fork and pushing, so the catalog ArgoCD clones in the next phase is already
correct. Doing it here rather than after ArgoCD is what means there is nothing to
self-heal.

The phase boundary between this and the next one *is* the dependency. `cluster-addons`
creates the Pod Identity associations, and EKS injects Pod Identity at pod **admission** —
a pod that starts before its association exists silently falls back to the node role and
fails later as a permission error naming the node rather than the pod.

### 5 · GitOps

Applies `cluster-bootstrap`: the ArgoCD install and the app-of-apps pointed at the fork
phase 4 already made correct. Then waits up to 30 minutes for every ArgoCD Application to
reach Healthy.

It creates no AWS resource the addons depend on — phase 4 built all of those — which is
the whole reason this is a separate, later phase.

### 6 · Platform

Applies the eks-agent-platform Terraform tree — the AWS substrate the operator governs
with — republishes `cluster-bootstrap` with `enable_eval_runtime=true`, then waits for
the agent-platform CRDs to be Established and the operator Deployment to be Available.

It **waits** for the operator; it does not install it. The GitOps catalog owns that: the
`addons-agent-operator` ApplicationSet deploys the chart, which carries its own CRDs. A
second Helm release of the same chart would race ArgoCD for ownership of the same
Deployment, ClusterRoles and CRDs. So a CRD that never establishes is a real failure — a
missing enable label, an ApplicationSet that generated nothing — and this phase says so
rather than papering over it by installing the chart a second way.

At the end of this phase the core platform is up and self-reconciling.

### 7 · Fleet *(opt-in)*

Enabled by `controlPlane.eksFleet`. Installs the Crossplane-based cluster control
plane for managing additional clusters as `Cluster` CRs. Requires
`org.gitops.clustersRepo`.

### 8 · Portal *(opt-in)*

Enabled by `controlPlane.portal`. Deploys the day-2 operator UI. Requires
`org.gitops.tenantsRepo`.

### 9 · Smoke *(opt-in)*

Enabled when `firstTenant` is set. Vends a first tenant from `charts/tenant` and waits up
to 15 minutes for its Platform to reach `status.phase: Ready`.

This proves the vending and identity path, which is what every earlier phase was building
toward. It is not the whole tenant surface: `charts/tenant` cannot express
`spec.datastores`, `spec.identity.capabilities` or `spec.identity.directSecretReads`, so a
tenant's AWS datastores and capability grants are not exercised here.

## Landing-zone components

Phases 3–5 drive the landing-zone Terragrunt components in this apply order. Phase 2
applies no component — it runs landing-zone's `scripts/init-backend-aws.sh`.

```
network → cluster → secrets → [agent-iam] → [managed-monitoring] → observability
  → [druid] → [dns] → [model-import] → [fleet-hub] → [tenant-substrate]
  → cluster-addons → cluster-bootstrap
```

Bracketed components are conditional on the config: `agent-iam` on
[`agentPlatform.enable`](/configuration/#agentplatform), `managed-monitoring` on
[`observability.tier: full`](/configuration/#observability), `druid` on
[`addons.druid`](/configuration/#addons), `dns` on
[`dns.hostedZone`](/configuration/#dns), `model-import` on
`agentPlatform.modelImport`, `fleet-hub` on
[`controlPlane.eksFleet`](/configuration/#controlplane), `tenant-substrate` on
`controlPlane.portal`.

The order is load-bearing and Terragrunt's own dependency graph does not express it. Two
pairs matter: `managed-monitoring` publishes the SSM parameters `cluster-bootstrap` reads
to stamp Grafana and AMP endpoints onto the ArgoCD cluster Secret, and `cluster-addons`
creates the Pod Identity associations before ArgoCD deploys the pods that need them. No
`dependency` block in these roots encodes either; this list plus the phase boundary that
splits it is what sequences them.

`rackctl destroy` runs the exact reverse.

## Rollback

Rollback is the narrowest of the engine's four answers to a failed phase, not the default
one. Reading it as unconditional is how an operator expects a re-apply to be safe and
finds it was not, or expects a failure to be cleaned up and finds it standing.

**When it does roll back**, it tears down the phases that already completed **and the
phase that just failed**, in reverse order. Including the failing phase is deliberate: a
phase that dies partway has usually already created resources, and rolling back only the
ones that succeeded is what left seven IAM roles behind after a failed `cluster-addons`.

Seven phases implement a real teardown — `cluster`, `substrate`, `gitops`, `platform`,
`fleet`, `portal` and `smoke`. `preflight`, `acquire` and `identity` are no-ops to roll
back, because they create nothing billable.

**It does not roll back at all** in four cases:

- **The failed phase is optional.** `fleet`, `portal` and `smoke` run after the platform
  is already usable and nothing they install is a prerequisite for anything before them.
  Nothing is torn down, the remaining phases still run, and the run exits non-zero at the
  end naming every optional phase that failed. For `smoke` in particular the alternative
  is perverse: the check would destroy the thing it was checking.
- **The platform was already standing when the run began** — or rackctl could not
  determine whether it was. `rackctl apply` is re-runnable by design, and against an
  existing cluster the early phases all succeed as no-ops and are recorded as completed;
  rolling those back would destroy the EKS cluster and the VPC of a healthy platform this
  run did not build. The probe fails closed, so an expired credential or a throttle
  disables rollback rather than arming it.
- **The failure declares itself un-rollbackable.** A failure to *converge* is not a
  failure to *provision*: ArgoCD not settling within 30 minutes, a pinned git ref that
  does not exist, a missing Terragrunt root. The cloud is fine and destroying it removes
  the only surface the problem can be diagnosed on.
- **`--no-clean-on-failure` was passed** to `plan` or `apply`, which leaves everything in
  place for debugging.

In every one of those cases the run says so and leaves the platform up. Tearing a
platform down is [`rackctl destroy`](/commands/#destroy) — an explicit, separate act.

## Dry-run

Under `rackctl plan`, every phase prints the commands it *would* run and
changes nothing. Read the plan before you provision — see the
[quickstart](/quickstart/#2-dry-run).
