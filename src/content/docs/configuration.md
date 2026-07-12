---
title: Configuration
description: The complete rackctl.yaml schema — every field, its type, defaults, and validation rules.
---

A `rackctl.yaml` describes a full-provision nanohype platform as one declarative,
re-runnable document. Its shape is derived directly from the platform sources:
landing-zone's `account.hcl`, the eks-fleet `Cluster` CR, and the
eks-agent-platform tenant chart.

Load it with `-c/--config` (default: `rackctl.yaml` in the working directory).
Unset fields are filled from [defaults](#defaults), then the whole document is
[validated](#validation) before any phase runs.

## `org`

Your organization and where its GitOps state lives.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `org.name` | string | **yes** | Organization slug (e.g. `acme`). |
| `org.gitops.eksGitopsRepo` | string | yes* | Your fork of `nanohype/eks-gitops` (the ArgoCD addon catalog). Defaults to `github.com/<org.name>/eks-gitops`. |
| `org.gitops.clustersRepo` | string | conditional | Backs eks-fleet `Cluster` CRs. Required when `controlPlane.eksFleet` is true. |
| `org.gitops.tenantsRepo` | string | conditional | Backs rendered tenant charts. Required when `controlPlane.portal` is true. |

## `cloud`

The target account. **AWS only in v1.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `cloud.provider` | `aws` | yes | Must be `aws`. `azure` is reserved — no `aks-gitops` catalog exists yet. |
| `cloud.accountId` | string | **yes** | 12-digit AWS account id. |
| `cloud.region` | string | yes | e.g. `us-west-2`. Defaults to `us-west-2`. |
| `cloud.profile` | string | **yes** | AWS SSO (Identity Center) profile name. |
| `cloud.identityCenter.manage` | bool | no | Let rackctl manage Identity Center. |
| `cloud.identityCenter.adminUser` | string | no | Admin user to grant when `manage` is true. |

## `environment`

`dev` · `staging` · `production`. Selects the eks-gitops overlay and default
sizing. Defaults to `dev`.

:::caution
`production` requires `cluster.endpointPublicAccess: false` — a public API server
in prod fails validation. See [footguns](/footguns/).
:::

## `cluster`

The EKS cluster and its network.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `cluster.version` | string | `"1.35"` | EKS version. Quote it. |
| `cluster.endpointPublicAccess` | bool | `true` | Must be `false` for production (needs bastion/VPN). |
| `cluster.systemNodes.instanceTypes` | []string | `[m7g.xlarge]` | System node group instance types. |
| `cluster.systemNodes.minSize` | int | `2` | |
| `cluster.systemNodes.maxSize` | int | `6` | |
| `cluster.systemNodes.desiredSize` | int | `2` | |
| `cluster.network.vpcCidr` | string | `10.0.0.0/16` | |
| `cluster.network.natGateways` | int | `1` | |
| `cluster.ttlDays` | int | `0` | eks-fleet auto-reap window. `0` = persistent. |

## `quotas`

Service quota handling, run before provisioning.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `quotas.autoRequest` | bool | `true` | File quota increases (e.g. `L-1216C47A`, EC2 vCPU) before provisioning. |
| `quotas.vcpu` | int | `256` | Target on-demand vCPU quota. |

:::note
`autoRequest` **files** the request; AWS approval isn't instant. Provision may
stall until a quota is granted. See [footguns](/footguns/).
:::

## `addons`

Optional cluster addons synced through the GitOps catalog.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `addons.observability` | bool | `true` | managed-monitoring (AMP + AMG). |
| `addons.druid` | bool | `false` | |
| `addons.accelerators` | bool | `false` | gpu-operator / neuron. |

## `dns`

Optional. Omit to skip DNS wiring.

| Field | Type | Notes |
|-------|------|-------|
| `dns.hostedZone` | string | Route 53 hosted zone (e.g. `acme.example.com`). |

## `agentPlatform`

The nanohype agent platform layer.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `agentPlatform.enable` | bool | `true` | Install the agent platform. |
| `agentPlatform.bedrockModelFamilies` | []string | `[anthropic, amazon-nova]` | Bedrock families to enable. |
| `agentPlatform.compliance.soc2` | bool | `true` | |
| `agentPlatform.compliance.hipaa` | bool | `false` | |

## `controlPlane`

Opt-in platform layers. Both are off by default.

| Field | Type | Notes |
|-------|------|-------|
| `controlPlane.eksFleet` | bool | Crossplane cluster control plane (multi-cluster). Requires `org.gitops.clustersRepo`. |
| `controlPlane.portal` | bool | The day-2 operator UI. Requires `org.gitops.tenantsRepo`. |

## `firstTenant`

Optional. When present, runs a first-tenant smoke test after provisioning.

| Field | Type | Notes |
|-------|------|-------|
| `firstTenant.name` | string | Tenant name. |
| `firstTenant.persona` | string | Persona (e.g. `generic`). |
| `firstTenant.tenant` | string | Tenant slug. |
| `firstTenant.monthlyBudgetUsd` | int | Guardrail budget. |

## Defaults

When a field is unset, rackctl fills it before validation:

- `cloud.provider` → `aws`, `cloud.region` → `us-west-2`
- `environment` → `dev`
- `cluster.version` → `1.35`; system nodes → `m7g.xlarge` × (2/6/2); network → `10.0.0.0/16`, 1 NAT gateway
- `quotas` → `autoRequest: true`, `vcpu: 256`
- `addons.observability` → `true`
- `agentPlatform` → enabled, `[anthropic, amazon-nova]`, SOC 2 on
- `org.gitops.eksGitopsRepo` → `github.com/<org.name>/eks-gitops` when your org name is set

## Validation

`init`, `destroy`, and `upgrade` all reject an invalid document before doing any
work. The rules:

- `org.name` is required.
- `cloud.provider` must be `aws`.
- `cloud.accountId` must be exactly 12 digits.
- `cloud.region` and `cloud.profile` are required.
- `environment` must be `dev`, `staging`, or `production`.
- `production` must not have `cluster.endpointPublicAccess: true`.
- `controlPlane.eksFleet` requires `org.gitops.clustersRepo`.
- `controlPlane.portal` requires `org.gitops.tenantsRepo`.

Errors are reported all at once, so you can fix everything in a single pass.
