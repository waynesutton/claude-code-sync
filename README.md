# claude-code-sync

[![npm version](https://img.shields.io/npm/v/claude-code-sync.svg)](https://www.npmjs.com/package/claude-code-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Sync your Claude Code sessions to [OpenSync](https://opensync.dev/) dashboard. Track coding sessions, analyze tool usage, and monitor token consumption across projects.

**GitHub:** [github.com/waynesutton/claude-code-sync](https://github.com/waynesutton/claude-code-sync)

**npm:** [npmjs.com/package/claude-code-sync](https://www.npmjs.com/package/claude-code-sync)

## OpenSync Ecosystem

| Package | Description | Install |
|---------|-------------|---------|
| [OpenSync](https://opensync.dev/) | Beautiful dashboards for OpenCode and Claude Code sessions synced to the cloud | [GitHub](https://github.com/waynesutton/opensync) |
| [opencode-sync-plugin](https://www.npmjs.com/package/opencode-sync-plugin) | Sync your OpenCode sessions to OpenSync dashboard | `npm install -g opencode-sync-plugin` |
| [claude-code-sync](https://www.npmjs.com/package/claude-code-sync) | Sync your Claude Code sessions to OpenSync dashboard | `npm install -g claude-code-sync` |

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

**Option A: Use the setup command (recommended)**

```bash
claude-code-sync setup
```

This automatically configures the hooks in `~/.claude/settings.json`.

**Option B: One-liner (copy and paste)**

```bash
mkdir -p ~/.claude && cat > ~/.claude/settings.json << 'EOF'
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "claude-code-sync hook SessionStart" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "claude-code-sync hook SessionEnd" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "claude-code-sync hook UserPromptSubmit" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "claude-code-sync hook PostToolUse" }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "claude-code-sync hook Stop" }] }]
  }
}
EOF
```

### 4. Verify Setup

```bash
claude-code-sync verify
```

You should see:

```
  OpenSync Setup Verification

Credentials: OK
   Convex URL: https://your-project.convex.cloud
   API Key: osk_****...****

Claude Code Config: OK
   Config file: ~/.claude/settings.json
   Hooks registered: claude-code-sync

Ready! Start Claude Code and sessions will sync automatically.
```

Sessions will now sync automatically when you use Claude Code.

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude-code-sync login` | Configure Convex URL and API Key |
| `claude-code-sync setup` | Add hooks to Claude Code settings |
| `claude-code-sync verify` | Verify credentials and Claude Code config |
| `claude-code-sync synctest` | Test connectivity and create a test session |
| `claude-code-sync logout` | Clear stored credentials |
| `claude-code-sync status` | Show connection status |
| `claude-code-sync config` | Show current configuration |
| `claude-code-sync config --json` | Show config as JSON |
| `claude-code-sync set <key> <value>` | Update a config value |
| `claude-code-sync hook <event>` | Handle Claude Code hook events (internal) |
| `claude-code-sync --version` | Show version number |
| `claude-code-sync --help` | Show help |

See [full command reference](docs/commands.md) for detailed usage, troubleshooting, and examples.

## Hook Events

The plugin captures these Claude Code events:

| Event | Description |
|-------|-------------|
| `SessionStart` | Fires when a coding session begins |
| `SessionEnd` | Fires when a session terminates |
| `UserPromptSubmit` | Fires when you submit a prompt |
| `PostToolUse` | Fires after each tool execution |
| `Stop` | Fires when Claude finishes responding |

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
See [docs](https://www.opensync.dev/docs)

### Need Help?

If you run into issues or have questions:

- **Report a bug or request a feature:** [GitHub Issues](https://github.com/waynesutton/claude-code-sync/issues)
- Check existing issues for solutions to common problems

## Requirements

- Node.js 18 or later
- Claude Code CLI
- A deployed OpenSync backend

## Links

### OpenSync

- [OpenSync](https://opensync.dev/) - Beautiful dashboards for OpenCode and Claude Code sessions
- [OpenSync Repository](https://github.com/waynesutton/opensync)

### claude-code-sync (this package)

- [GitHub Repository](https://github.com/waynesutton/claude-code-sync)
- [npm Package](https://www.npmjs.com/package/claude-code-sync)
- [Issues and Support](https://github.com/waynesutton/claude-code-sync/issues)

### opencode-sync-plugin

- [GitHub Repository](https://github.com/waynesutton/opencode-sync-plugin)
- [npm Package](https://www.npmjs.com/package/opencode-sync-plugin)

## License

MIT
