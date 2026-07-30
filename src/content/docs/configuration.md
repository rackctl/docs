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
| `cluster.name` | string | **required** | Cluster base. The EKS cluster is `<environment>-<name>`. Unique per account+environment, and must not equal the environment. |
| `cluster.version` | string | `"1.36"` | EKS version, major.minor only — no patch component, no leading `v`. Quote it. Matches landing-zone's own default. |
| `cluster.endpointPublicAccess` | bool | `true` | Must be `false` for production (needs bastion/VPN). |
| `cluster.endpointAllowlist` | []string | `[]` | CIDRs allowed to reach a public API endpoint. Empty + public ⇒ rackctl auto-detects this host's egress IP as `<ip>/32`, never `0.0.0.0/0`. |
| `cluster.systemNodes.instanceTypes` | []string | `[m7g.xlarge]` | System node group instance types. |
| `cluster.systemNodes.minSize` | int | `2` | |
| `cluster.systemNodes.maxSize` | int | `6` | |
| `cluster.systemNodes.desiredSize` | int | `2` | |
| `cluster.network.mode` | `create` \| `adopt` | `create` | See [network mode](#network-mode) below. |
| `cluster.network.vpcCidr` | string | `10.0.0.0/16` | `create` mode only. |
| `cluster.network.natGateways` | int | `1` | `create` mode only. `1` (shared) or equal to the AZ count (per-AZ HA). |

:::note[Defaults are not injected]
rackctl passes a sizing field to Terraform **only when it differs from the default in
this table**. An ambient `TF_VAR_*` overrides whatever a terragrunt leaf pinned, so
sending a default would silently overwrite a deliberate choice — the staging and
production network leaves pin `nat_gateways = 3` for per-AZ redundancy, and injecting
the default `1` would quietly collapse both to a single shared NAT gateway.

The practical consequence: leaving a field at its default and setting it explicitly to
the same value are the same thing here, and both leave the leaf in charge.
:::

### Network mode

`create` (the default) means this platform owns its VPC: it builds the VPC, subnets,
endpoints, egress and the ELB role tags. That is what a day-0 hub normally wants.

`adopt` means participating in a VPC someone else owns — a shared VPC in this account,
or one shared in over AWS RAM. It builds **nothing**. The VPC, subnets, CIDR and AZs are
resolved from the `adopt*` fields and re-exported through the same outputs, so the
cluster wires identically either way. The owner runs the VPC, the endpoints, the egress
and the subnet tagging.

| Field | Type | Notes |
|-------|------|-------|
| `cluster.network.adoptVpcId` | string | Required under `adopt`, rejected under `create`. |
| `cluster.network.adoptPrivateSubnetIds` | []string | Where nodes and pods run. At least 3 distinct subnets, for the zone spread landing-zone asserts. |
| `cluster.network.adoptPublicSubnetIds` | []string | Optional — omit for a private-only cluster. |

:::caution[Omitting public subnets has a consequence]
Internal load balancers still work, but an internet-facing Service or Ingress will not
provision: the Kyverno rule that injects load-balancer subnets guards on a non-empty
public list, sourced from the `kube-system/network-config` ConfigMap.
:::

Under `adopt`, rackctl also sends `nat_gateways=1` and `enable_flow_logs=false`, because
the staging and production leaves pin create-mode values (`3` and `true`) that
landing-zone rejects under `adopt`. Both are the VPC owner's concern for a VPC this
platform does not own, so overriding them changes nothing real.

`create`-mode levers — all off by default, all rejected under `adopt`:

| Field | Type | Notes |
|-------|------|-------|
| `cluster.network.ipamPoolId` | string | Draw the VPC CIDR from an IPAM pool instead of `vpcCidr`. |
| `cluster.network.ipamNetmaskLength` | int | 16–20, required with `ipamPoolId`. Subnets carve 8 bits smaller, so `/20` is the smallest that clears AWS's `/28` minimum. |
| `cluster.network.transitGatewayId` | string | Attach the VPC to a transit gateway. Requires an IPAM-allocated CIDR so prefixes cannot overlap. |
| `cluster.network.centralizedEgress` | bool | Private default route via the TGW to a central egress VPC, zero local NAT gateways. Requires `transitGatewayId`. |

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

## `observability`

Which observability substrate the cluster runs. One field, because the two things it
replaces could be set to contradict each other.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `observability.tier` | `full` \| `floor` | `full` | Published as the `observability/tier` label on the ArgoCD cluster Secret. Every tier-aware ApplicationSet either selects on it or derives a value from it. |

**`full`** — the in-cluster LGTM stack (Loki, Tempo, kube-state-metrics,
grafana-operator) plus Amazon Managed Prometheus and Grafana. rackctl applies the
`managed-monitoring` component, which is the only thing that writes the Secrets Manager
entry the full-tier OTel gateway mounts as `AMP_REMOTE_WRITE_URL`.

**`floor`** — the provider-native path: ContainerInsights metrics, CloudWatch EMF metrics,
CloudWatch Logs, and traces to AWS X-Ray. `managed-monitoring` is not applied, so there is
no AMP/AMG cost. Floor is a different backend, not a smaller one — no signal is dropped.
Its own cost is EMF custom-metric cardinality, tuned in the eks-gitops values file.

Both tiers run the OTel node agent and a gateway on the same endpoint, so a tenant chart is
byte-identical across tiers; only the exporters differ.

:::caution[The tier is a day-0 decision]
rackctl injects the tier on every run and it overrides whatever the committed leaf pinned.
Changing `full` → `floor` on a cluster that is already running prunes Loki, Tempo,
grafana-operator and the dashboards, with a telemetry gap while it converges. See the
`observability-tier` runbook in `eks-gitops` before flipping one on a live cluster.
:::

## `addons`

Optional cluster addons synced through the GitOps catalog.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `addons.druid` | bool | `false` | Per-tenant analytics substrate — Aurora Serverless, optionally MSK. Real money; its live leaf carries its own tenant sizing map. |
| `addons.accelerators` | bool | `false` | Labels the cluster so the accelerators ApplicationSet (gpu-operator, nvidia-dra-driver) targets it. Leave off without GPU nodes: the driver cannot pull its image without an NGC key and has nothing to schedule on. |

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
- `cluster.version` → `1.36`; system nodes → `m7g.xlarge` × (2/6/2); network → `create` mode, `10.0.0.0/16`, 1 NAT gateway
- `quotas` → `autoRequest: true`, `vcpu: 256`
- `observability.tier` → `full`
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
