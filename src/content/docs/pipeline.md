---
title: The pipeline
description: The ordered 0→running bootstrap rackctl walks — ten phases, what each does, and how rollback works.
---

`rackctl init` walks an ordered pipeline. Phases 0–6 are the core 0→running path
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
| 4 | `gitops` | Secrets & ArgoCD GitOps bootstrap | always |
| 5 | `addons` | Addon convergence & IRSA writeback | always |
| 6 | `platform` | Agent-platform substrate, CRDs & operator | always |
| 7 | `fleet` | Cluster control plane (eks-fleet) | `controlPlane.eksFleet` |
| 8 | `portal` | Operator portal (day-2 UI) | `controlPlane.portal` |
| 9 | `smoke` | First-tenant smoke test | `firstTenant` is set |

### 0 · Preflight

Confirms the [required tools](/install/#prerequisites) are present, that your AWS
identity resolves and matches `cloud.accountId`, and — when `quotas.autoRequest` is
on — files any needed service quota increases before anything is provisioned.

### 1 · Acquire

Clones and forks the platform repos into your org (`eks-gitops`, and the
control-plane repos when their layers are enabled), so the rest of the pipeline has
GitOps state to write to.

### 2 · Identity

Stands up Identity Center (when `cloud.identityCenter.manage` is set) and the
Terraform/OpenTofu remote state backend the landing-zone components use.

### 3 · Cluster

Applies the `network` and `cluster` landing-zone components — the VPC and the EKS
control plane and system node group.

### 4 · GitOps

Applies `secrets` and `cluster-bootstrap`: External Secrets wiring and the ArgoCD
install that will reconcile everything downstream.

### 5 · Addons

Applies `cluster-addons` and performs the **IRSA account-id writeback** — patching
the GitOps repo so IAM Roles for Service Accounts resolve to the real account,
then waiting for the addon catalog to converge.

### 6 · Platform

Installs the agent-platform substrate, CRDs, and the operator (from its OCI chart,
with a local-checkout fallback). At the end of this phase the core platform is up
and self-reconciling.

### 7 · Fleet *(opt-in)*

Enabled by `controlPlane.eksFleet`. Installs the Crossplane-based cluster control
plane for managing additional clusters as `Cluster` CRs. Requires
`org.gitops.clustersRepo`.

### 8 · Portal *(opt-in)*

Enabled by `controlPlane.portal`. Deploys the day-2 operator UI. Requires
`org.gitops.tenantsRepo`.

### 9 · Smoke *(opt-in)*

Enabled when `firstTenant` is set. Provisions a first tenant and verifies it comes
up healthy — a real end-to-end check that the platform can actually land a
workload.

## Landing-zone components

Phases 2–5 drive the landing-zone Terragrunt components in this apply order:

```
network → cluster → secrets → cluster-bootstrap → cluster-addons
```

`rackctl destroy` runs the exact reverse.

## Rollback

If a phase fails, the engine tears down the phases that already completed, in
reverse order — so a half-finished `init` doesn't leave billable resources
stranded. Phases that create cloud resources (cluster, gitops, addons, platform)
implement real teardown; the others are no-ops to roll back.

Pass `--no-clean-on-failure` to `init` to skip rollback and leave everything in
place for debugging.

## Dry-run

Until you pass `--apply`, every phase prints the commands it *would* run and
changes nothing. Read the plan before you provision — see the
[quickstart](/quickstart/#2-dry-run).
