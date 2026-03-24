# setup-vp

GitHub Action to set up [Vite+](https://viteplus.dev) (`vp`) with dependency caching support.

## Features

- Install Vite+ globally via official install scripts
- Optionally set up a specific Node.js version via `vp env use`
- Cache project dependencies with auto-detection of lock files
- Optionally run `vp install` after setup
- Support for all major package managers (npm, pnpm, yarn)

## Usage

### Basic Usage

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
```

### With Node.js Version

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      node-version: "22"
```

### With Node.js Version File

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      node-version-file: ".node-version"
```

### With Working Directory

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      working-directory: web
      node-version-file: ".nvmrc"
      cache: true
      run-install: true
```

### With Caching and Install

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      node-version: "22"
      cache: true
      run-install: true
```

### Specific Version

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      version: "1.2.3"
      node-version: "22"
      cache: true
```

### Advanced Run Install

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      node-version: "22"
      cache: true
      run-install: |
        - cwd: ./packages/app
          args: ['--frozen-lockfile']
        - cwd: ./packages/lib
```

### With Private Registry (GitHub Packages)

When using `registry-url`, set `run-install: false` and run install manually with the auth token, otherwise the default auto-install will fail for private packages.

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: voidzero-dev/setup-vp@v1
    with:
      node-version: "22"
      registry-url: "https://npm.pkg.github.com"
      scope: "@myorg"
      run-install: false
  - run: vp install
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Alpine Container

Alpine Linux uses musl libc instead of glibc. Install compatibility packages before using the action:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: alpine:3.21
    steps:
      - run: apk add --no-cache bash curl gcompat libstdc++
      - uses: actions/checkout@v6
      - uses: voidzero-dev/setup-vp@v1
```

### Matrix Testing with Multiple Node.js Versions

```yaml
jobs:
  test:
    strategy:
      matrix:
        node-version: ["20", "22", "24"]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: voidzero-dev/setup-vp@v1
        with:
          node-version: ${{ matrix.node-version }}
          cache: true
      - run: vp run test
```

## Inputs

| Input                   | Description                                                                                                 | Required | Default        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| `version`               | Version of Vite+ to install                                                                                 | No       | `latest`       |
| `node-version`          | Node.js version to install via `vp env use`                                                                 | No       | Latest LTS     |
| `node-version-file`     | Path to file containing Node.js version (`.nvmrc`, `.node-version`, `.tool-versions`, `package.json`)       | No       |                |
| `working-directory`     | Project directory used for relative paths, lockfile auto-detection, environment checks, and default install | No       | Workspace root |
| `run-install`           | Run `vp install` after setup. Accepts boolean or YAML object with `cwd`/`args`                              | No       | `true`         |
| `cache`                 | Enable caching of project dependencies                                                                      | No       | `false`        |
| `cache-dependency-path` | Path to lock file for cache key generation                                                                  | No       | Auto-detected  |
| `registry-url`          | Optional registry to set up for auth. Sets the registry in `.npmrc` and reads auth from `NODE_AUTH_TOKEN`   | No       |                |
| `scope`                 | Optional scope for scoped registries. Falls back to repo owner for GitHub Packages                          | No       |                |

When `working-directory` is set, relative `run-install.cwd`, `node-version-file`, and `cache-dependency-path` values are resolved from that directory.

## Outputs

| Output      | Description                              |
| ----------- | ---------------------------------------- |
| `version`   | The installed version of Vite+           |
| `cache-hit` | Boolean indicating if cache was restored |

## Caching

### Dependency Cache

When `cache: true` is set, the action additionally caches project dependencies by auto-detecting your lock file:

| Lock File           | Package Manager | Cache Directory |
| ------------------- | --------------- | --------------- |
| `pnpm-lock.yaml`    | pnpm            | pnpm store      |
| `package-lock.json` | npm             | npm cache       |
| `yarn.lock`         | yarn            | yarn cache      |

The dependency cache key format is: `vite-plus-{OS}-{arch}-{pm}-{lockfile-hash}`

When `working-directory` is set, lockfile auto-detection runs in that directory.

When `cache-dependency-path` points to a lock file in a subdirectory, the action resolves the package-manager cache directory from that lock file's directory.

## Example Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: voidzero-dev/setup-vp@v1
        with:
          node-version: "22"
          cache: true

      - run: vp run build

      - run: vp run test
```

## Development

### Install Vite+ CLI

- **Linux / macOS:** `curl -fsSL https://viteplus.dev/install.sh | bash`
- **Windows:** `irm https://viteplus.dev/install.ps1 | iex`

### Setup

```bash
git clone https://github.com/voidzero-dev/setup-vp.git
cd setup-vp
vp install
```

### Available Commands

| Command             | Description              |
| ------------------- | ------------------------ |
| `vp run build`      | Build (outputs to dist/) |
| `vp run test`       | Run tests                |
| `vp run test:watch` | Run tests in watch mode  |
| `vp run typecheck`  | Type check               |
| `vp run check`      | Lint + format check      |
| `vp run check:fix`  | Auto-fix lint/format     |

### Before Committing

- Run `vp run check:fix` and `vp run build`
- The `dist/index.mjs` must be committed (it's the compiled action entry point)
- Pre-commit hooks (via husky + lint-staged) will automatically run `vp check --fix` on staged files via `vpx lint-staged`

## Feedback

If you have any feedback or issues, please [submit an issue](https://github.com/voidzero-dev/setup-vp/issues).

## License

[MIT](LICENSE)
