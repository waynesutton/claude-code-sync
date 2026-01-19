# claude-code-sync

[![npm version](https://img.shields.io/npm/v/claude-code-sync.svg)](https://www.npmjs.com/package/claude-code-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Sync your Claude Code sessions to [OpenSync](https://github.com/waynesutton/opensync) dashboard. Track coding sessions, analyze tool usage, and monitor token consumption across projects.

**GitHub:** [github.com/waynesutton/claude-code-sync](https://github.com/waynesutton/claude-code-sync)

**npm:** [npmjs.com/package/claude-code-sync](https://www.npmjs.com/package/claude-code-sync)

## Installation

```bash
npm install -g claude-code-sync
```

## Quick Start

### 1. Get Your API Key

1. Log into your OpenSync dashboard
2. Go to **Settings**
3. Click **Generate API Key**
4. Copy the key (starts with `osk_`)

### 2. Configure the Plugin

```bash
claude-code-sync login
```

Enter when prompted:
- **Convex URL**: Your deployment URL (e.g., `https://your-project.convex.cloud`)
- **API Key**: Your API key from Settings (e.g., `osk_abc123...`)

### 3. Add to Claude Code

Add the plugin to your Claude Code configuration. Sessions will sync automatically.

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude-code-sync login` | Configure Convex URL and API Key |
| `claude-code-sync logout` | Clear stored credentials |
| `claude-code-sync status` | Show connection status |
| `claude-code-sync config` | Show current configuration |
| `claude-code-sync config --json` | Show config as JSON |
| `claude-code-sync set <key> <value>` | Update a config value |
| `claude-code-sync --version` | Show version number |
| `claude-code-sync --help` | Show help |

See [full command reference](docs/commands.md) for detailed usage, troubleshooting, and examples.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoSync` | boolean | `true` | Automatically sync sessions |
| `syncToolCalls` | boolean | `true` | Include tool call details |
| `syncThinking` | boolean | `false` | Include thinking traces |

Set options with:

```bash
claude-code-sync set syncThinking true
```

## Environment Variables

You can also configure via environment variables:

```bash
export CLAUDE_SYNC_CONVEX_URL="https://your-project.convex.cloud"
export CLAUDE_SYNC_API_KEY="osk_your_api_key"
export CLAUDE_SYNC_AUTO_SYNC="true"
export CLAUDE_SYNC_TOOL_CALLS="true"
export CLAUDE_SYNC_THINKING="false"
```

## What Gets Synced

| Data | Description |
|------|-------------|
| Session metadata | Project path, working directory, git branch, timestamps |
| User prompts | Your messages to Claude |
| Assistant responses | Claude's responses |
| Tool calls | Which tools were used and their outcomes |
| Token usage | Input and output token counts |
| Model info | Which Claude model was used |
| Cost estimate | Estimated session cost |

## Privacy

- All data goes to YOUR Convex deployment
- Sensitive fields are automatically redacted
- Full file contents are not synced, only paths
- Thinking traces are off by default
- You control what gets synced via configuration

## Troubleshooting

```bash
# Check status and connection
claude-code-sync status

# View current config
claude-code-sync config --json

# Full reset
npm uninstall -g claude-code-sync
rm -rf ~/.config/claude-code-sync
npm install -g claude-code-sync
claude-code-sync login
```

See [troubleshooting guide](docs/commands.md#troubleshooting) for more solutions.

## Requirements

- Node.js 18 or later
- Claude Code CLI
- A deployed OpenSync backend

## Links

- [claude-code-sync Repository](https://github.com/waynesutton/claude-code-sync)
- [OpenSync Backend](https://github.com/waynesutton/opensync)
- [OpenSync Dashboard](https://opensyncsessions.netlify.app)
- [npm Package](https://www.npmjs.com/package/claude-code-sync)

## License

MIT
