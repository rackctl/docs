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
| `cloud.assumeRole.roleArn` | string | conditional | The role rackctl assumes before it touches the cloud. Required when the `assumeRole` block is present. It composes with `profile` rather than replacing it — the profile is the *source* identity, this is what that identity assumes. |
| `cloud.assumeRole.externalId` | string | no | Presented as `sts:ExternalId`, for the cross-account trust policies that follow the confused-deputy guidance. |
| `cloud.assumeRole.sessionName` | string | no | Names the session in CloudTrail, so the trail says which config did the work rather than only which role. Defaults to `rackctl-<environment>`. 2–64 characters of `[a-zA-Z0-9=,.@-]`. |
| `cloud.assumeRole.durationSeconds` | int | no | Requested session length, 900–43200. Defaults to one hour. A full apply can outlive an hour, so rackctl re-assumes as a session nears expiry; raising this only changes how often that happens. |

:::note[Why a role at all]
Without `assumeRole`, every AWS write — creating IAM roles and KMS keys, deleting
clusters and volumes — runs on whoever's SSO session is ambient. That is fine for one
person on a laptop and wrong everywhere else: CloudTrail attributes the whole install to
a human, there is no identity to scope permissions to, and nothing to hand to CI.
:::

## `environment`

`development` · `staging` · `production`. Selects the eks-gitops overlay and default
sizing. Defaults to `development`.

:::caution
`production` requires `cluster.endpointPublicAccess: false` — a public API server
in prod fails validation. See [footguns](/footguns/).
:::

## `cluster`

The EKS cluster and its network.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `cluster.name` | string | **required** | Cluster base. The EKS cluster is `<environment>-<name>`. A lowercase RFC-1123 label of at most 12 characters, unique per account+region+environment, and it must not equal the environment. The 12 is not arbitrary: the derived name feeds cluster-scoped S3 and IAM names, and the tightest of them fits inside S3's 63-character limit only at that length. |
| `cluster.version` | string | `"1.36"` | EKS version, major.minor only — no patch component, no leading `v`. Quote it. Matches landing-zone's own default. |
| `cluster.endpointPublicAccess` | bool | `false` when omitted | Must be `false` for production (needs bastion/VPN). A bool has no unset state, so an omitted key is `false` — write `true` explicitly to get a public endpoint. |
| `cluster.endpointAllowlist` | []string | `[]` | CIDRs allowed to reach a public API endpoint. Empty + public ⇒ rackctl auto-detects this host's egress IP as `<ip>/32`, never `0.0.0.0/0`. |
| `cluster.systemNodes.instanceTypes` | []string | `[m7g.xlarge, m6g.xlarge]` | System node group instance types. Matches landing-zone's own default, so writing exactly this value injects nothing — see the note below. |
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
| `quotas.autoRequest` | bool | `true` | File quota increases (e.g. `L-1216C47A`, EC2 vCPU) before provisioning. To turn it **off** you must also set `quotas.vcpu` — see below. |
| `quotas.vcpu` | int | `256` | Target on-demand vCPU quota. |

:::caution[`quotas` is the one block replaced wholesale]
Every other sub-struct is defaulted field by field. `quotas` is not: when `quotas.vcpu` is
0 the whole block is replaced by its defaults, so a config writing `autoRequest: false`
and no `vcpu` has `autoRequest` forced back to `true`. Set both, or neither.
:::

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

:::caution[`addons.accelerators` is retired]
The GPU path has been removed: the accelerators ApplicationSet, the `accelerator-pools`
component and its live roots, and the cluster label they were selected by. The model path is
Bedrock — see [`agentPlatform`](#agentplatform).

A config still carrying `addons.accelerators` is **refused at load**, not ignored. rackctl's
YAML decoder drops keys it does not recognise, so silently accepting a retired one would let a
config ask for a thing and get nothing, forever, without a word. The refusal names the key and
what happened to it.
:::

## `dns`

Optional. Omit to skip DNS wiring.

| Field | Type | Notes |
|-------|------|-------|
| `dns.hostedZone` | string | Route 53 hosted zone (e.g. `acme.example.com`). |

## `agentPlatform`

The nanohype agent platform layer.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `agentPlatform.enable` | bool | `true` | Install the agent platform. An omitted block means enabled — it is the point of the platform. |
| `agentPlatform.bedrockModelFamilies` | []string | `[anthropic, amazon-nova]` | Bedrock families to enable. Mapped onto IAM resource globs (`anthropic` → `anthropic.*`, `amazon-nova` → `amazon.nova-*`); an unknown family gets a trailing `.*` so a typo is still a scoped grant rather than a silent `Resource: "*"`. |
| `agentPlatform.modelImport` | bool | `false` | Applies landing-zone's `model-import` component: the S3 staging bucket, the IAM role Bedrock assumes during a `CreateModelImportJob`, and two SSM discovery parameters. It imports **no** model — that is a deliberate out-of-band act. Requires `agentPlatform.enable`, and a `cloud.region` of `us-west-2`, `us-east-1`, `us-east-2` or `eu-central-1`. |
| `agentPlatform.costPipeline` | bool | `true` | Applies the `cost-pipeline` and `cost-access` roots — per-tenant spend attribution, which every `BudgetPolicy` is measured on. An omitted field means on; defaulting it off would ship a budget control measuring nothing. It needs `/platform/org/cost/cur-export-{bucket,prefix,name}` in SSM, written by landing-zone's org-cost root in the management account, and preflight asserts them before a dollar is spent. |
| `agentPlatform.compliance.soc2` | bool | `false` when omitted | Set it explicitly. |
| `agentPlatform.compliance.hipaa` | bool | `false` | |

:::note[`compliance` is not defaulted]
Unlike the fields above it, the `compliance` block is never filled in. An omitted block
leaves both flags `false`, and that is what the first-tenant smoke test passes through to
`charts/tenant`. If you want SOC 2 on the tenants this install vends, write it.
:::

## `controlPlane`

Opt-in platform layers. Both are off by default.

| Field | Type | Notes |
|-------|------|-------|
| `controlPlane.eksFleet` | bool | Crossplane cluster control plane (multi-cluster). Requires `org.gitops.clustersRepo`. |
| `controlPlane.portal` | bool | The day-2 operator UI. Requires `org.gitops.tenantsRepo`. |
| `controlPlane.fleetHubRoleArn` | string | Optional, and normally left unset. The IAM role provider-opentofu assumes to vend spoke clusters. rackctl applies `fleet-hub` itself and that component pins the role name, so the ARN is a function of the account — requiring an operator to paste a value rackctl can compute has only two outcomes, correct and a typo that installs a credential-less provider. Set it **only** to vend through a hub in a different account. Shape-validated when present. |

## `firstTenant`

Optional. When present, runs a first-tenant smoke test after provisioning.

| Field | Type | Notes |
|-------|------|-------|
| `firstTenant.name` | string | Tenant name. |
| `firstTenant.persona` | string | Persona (e.g. `generic`). |
| `firstTenant.tenant` | string | Tenant slug. |
| `firstTenant.monthlyBudgetUsd` | int | Guardrail budget. |

## `versions`

Optional. Pins the platform repos this install is built from. Every field is a git ref — a
tag, a branch, or a commit — and an empty field means that repo's default branch, so
pinning is opt-in per repo.

Without it, each run builds from whatever was on `main` at the moment it ran: two installs
a week apart are two different platforms, and there is no way to say "build the one that
worked".

| Field | Type | Notes |
|-------|------|-------|
| `versions.landingZone` | string | Ref for `nanohype/landing-zone`. |
| `versions.eksGitops` | string | Ref for your `eks-gitops` fork. It has a second half: the value rides `TF_VAR_gitops_repo_branch` into `cluster-bootstrap`, which stamps `gitops/repo-branch` on the ArgoCD cluster Secret, from which every ApplicationSet templates its `targetRevision`. Without that, the cluster syncs `main` whatever the local checkout says and the pin is a comment. |
| `versions.eksAgentPlatform` | string | Ref for `nanohype/eks-agent-platform`. |
| `versions.portal` | string | Ref for `nanohype/portal`. |
| `versions.eksFleet` | string | Ref for `nanohype/eks-fleet`. |

A pinned checkout is checked out at that ref and never fast-forwarded, and an unknown ref
stops the run rather than falling back to the default branch.

## Defaults

When a field is unset, rackctl fills it before validation:

- `cloud.provider` → `aws`, `cloud.region` → `us-west-2`
- `environment` → `development`
- `cluster.version` → `1.36`; system nodes → `[m7g.xlarge, m6g.xlarge]` × (2/6/2); network → `create` mode, `10.0.0.0/16`, 1 NAT gateway
- `quotas` → `autoRequest: true`, `vcpu: 256`
- `observability.tier` → `full`
- `agentPlatform` → enabled, `[anthropic, amazon-nova]`, `costPipeline` on
- `org.gitops.eksGitopsRepo` → `github.com/<org.name>/eks-gitops` when your org name is set

Three things are **not** filled in, because a bool has no unset state and the defaulting
never reaches them: `cluster.endpointPublicAccess`, `agentPlatform.compliance.soc2` and
`agentPlatform.compliance.hipaa`. An omitted key is `false`. And `quotas` is replaced as a
whole block rather than field by field — see the caution above it.

## Validation

`plan`, `apply`, `destroy`, and `check` all reject an invalid document before doing any
work. The rules:

- `org.name` is required.
- `cloud.provider` must be `aws`.
- `cloud.accountId` must be exactly 12 digits.
- `cloud.region` and `cloud.profile` are required.
- `environment` must be `development`, `staging`, or `production`.
- `production` must not have `cluster.endpointPublicAccess: true`.
- `controlPlane.eksFleet` requires `org.gitops.clustersRepo`.
- `controlPlane.portal` requires `org.gitops.tenantsRepo`.
- `cluster.name` must be a lowercase RFC-1123 label of at most 12 characters, and must not equal the environment.
- `cluster.version` must be Kubernetes major.minor — no patch component, no leading `v`.
- System node sizes must hold `1 ≤ minSize ≤ desiredSize ≤ maxSize`, and `instanceTypes` must not be empty.
- Every `cluster.endpointAllowlist` entry must parse as a CIDR block — checked whether or not the endpoint is public, because an allow-list that is wrong is wrong while it is unused.
- `cluster.network.mode` must be `create`, `adopt`, or omitted. Under `adopt`, `adoptVpcId` and a non-empty `adoptPrivateSubnetIds` are required and the create-mode levers are rejected; under `create` the three `adopt*` fields are rejected.
- Adopted ids are shape-checked (`vpc-…`, `subnet-…`), a subnet may not appear in both adopt lists, and `adoptPrivateSubnetIds` needs at least 3 **distinct** entries — landing-zone asserts the private subnets span 3 zones, and *n* subnets can never cover more than *n* zones.
- `ipamPoolId` is mutually exclusive with a non-default `vpcCidr`, and requires `ipamNetmaskLength` between 16 and 20. Without a pool, `ipamNetmaskLength` must be 0.
- `transitGatewayId` requires `ipamPoolId`; `centralizedEgress` requires `transitGatewayId`.
- `observability.tier` must be `full` or `floor`.
- `agentPlatform.modelImport` requires `agentPlatform.enable`, and a `cloud.region` of `us-west-2`, `us-east-1`, `us-east-2` or `eu-central-1`.
- `cloud.assumeRole`, when present, requires a well-formed `roleArn`; `durationSeconds` must be 900–43200 and `sessionName` 2–64 characters of `[a-zA-Z0-9=,.@-]`.
- `controlPlane.fleetHubRoleArn`, when set, must be an IAM role ARN.

Most of these mirror a validation landing-zone makes at plan time. Making them here too is
the difference between failing in a second and failing minutes into a `tofu` run with a
VPC already built.

Errors are reported all at once, so you can fix everything in a single pass.
