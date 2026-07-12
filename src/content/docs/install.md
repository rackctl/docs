---
title: Install
description: Install the rackctl CLI via the install script, Homebrew, or from source — and the tools it shells out to.
---

`rackctl` is a single static Go binary. It ships for macOS and Linux, on both
`amd64` and `arm64`.

## Install script

The quickest path. Downloads the release archive for your platform, verifies it
against the published `checksums.txt`, and installs `rackctl` to `/usr/local/bin`.

```sh
curl -fsSL rackctl.com/install | sh
```

Prefer to read before you run? The script lives in the repo at
[`scripts/install.sh`](https://github.com/rackctl/rackctl/blob/main/scripts/install.sh).
Pipe it to a file, inspect it, then run it.

## Homebrew

```sh
brew install rackctl/tap/rackctl
```

The formula in [`rackctl/homebrew-tap`](https://github.com/rackctl/homebrew-tap)
is published automatically by goreleaser on every release.

## From source

Requires Go 1.26 or newer.

```sh
git clone https://github.com/rackctl/rackctl
cd rackctl
make build          # -> ./dist/rackctl
# or install onto your PATH:
go install github.com/rackctl/rackctl@latest
```

## Verify

```sh
rackctl version
```

## Prerequisites

`rackctl` orchestrates the tools you already use to run a platform — it doesn't
bundle them. Install these and make sure they're on your `PATH`:

| Tool | Used for |
|------|----------|
| `tofu` | OpenTofu — provisions the AWS substrate |
| `terragrunt` | Wraps the landing-zone Terragrunt components |
| `kubectl` | Talks to the EKS cluster |
| `helm` | Installs the operator and addon charts |
| `aws` | AWS CLI — identity, quotas, and API calls |
| `git` | Clones and manages the platform repos |
| `gh` | GitHub CLI — forks the org repos |

Run [`rackctl doctor`](/commands/#doctor) to confirm they're all present and that
your AWS identity resolves before you provision anything.

## Next

Head to the [quickstart](/quickstart/) to write your first `rackctl.yaml`.
