# claude-code-sync

Sync your Claude Code sessions to [OpenSync](https://github.com/waynesutton/opensync) dashboard. Track coding sessions, analyze tool usage, and monitor token consumption across projects.

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
| `claude-code-sync set <key> <value>` | Update a config value |

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

## Requirements

- Node.js 18 or later
- Claude Code CLI
- A deployed OpenSync backend

## Links

- [OpenSync Repository](https://github.com/waynesutton/opensync)
- [OpenSync Dashboard](https://opensyncsessions.netlify.app)
- [OpenCode Sync Plugin](https://www.npmjs.com/package/opencode-sync-plugin)

## License

MIT
# claude-code-sync
