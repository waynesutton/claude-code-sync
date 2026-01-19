#!/usr/bin/env node

/**
 * Claude Code Sync CLI
 *
 * Commands:
 *   login   - Configure Convex URL and API Key
 *   logout  - Clear stored credentials
 *   status  - Show connection status
 *   config  - Show current configuration
 */

import { Command } from "commander";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import {
  loadConfig,
  saveConfig,
  clearConfig,
  SyncClient,
  Config,
} from "./index";

// Read version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("claude-code-sync")
  .description("Sync Claude Code sessions to OpenSync dashboard")
  .version(getVersion());

// ============================================================================
// Helper Functions
// ============================================================================

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}

// ============================================================================
// Commands
// ============================================================================

program
  .command("login")
  .description("Configure Convex URL and API Key")
  .action(async () => {
    console.log("\n  Claude Code Sync - Login\n");
    console.log("Get your API key from your OpenSync dashboard:");
    console.log("  1. Go to Settings");
    console.log("  2. Click 'Generate API Key'");
    console.log("  3. Copy the key (starts with osk_)\n");

    const convexUrl = await prompt("Convex URL (e.g., https://your-project.convex.cloud): ");

    if (!convexUrl) {
      console.error("Error: Convex URL is required");
      process.exit(1);
    }

    if (!convexUrl.includes("convex.cloud") && !convexUrl.includes("convex.site")) {
      console.error("Error: Invalid Convex URL. Must contain convex.cloud or convex.site");
      process.exit(1);
    }

    const apiKey = await prompt("API Key (osk_...): ");

    if (!apiKey) {
      console.error("Error: API Key is required");
      process.exit(1);
    }

    if (!apiKey.startsWith("osk_")) {
      console.error("Error: Invalid API Key. Must start with osk_");
      process.exit(1);
    }

    const config: Config = {
      convexUrl,
      apiKey,
      autoSync: true,
      syncToolCalls: true,
      syncThinking: false,
    };

    // Test connection
    console.log("\nTesting connection...");
    const client = new SyncClient(config);
    const connected = await client.testConnection();

    if (!connected) {
      console.error("Error: Could not connect to Convex backend");
      console.error("   Check your URL and try again");
      process.exit(1);
    }

    // Save config
    saveConfig(config);
    console.log("\nConfiguration saved!");
    console.log(`   URL: ${convexUrl}`);
    console.log(`   Key: ${maskApiKey(apiKey)}`);
    console.log("\nAdd the plugin to your Claude Code config to start syncing.\n");
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(() => {
    clearConfig();
    console.log("Credentials cleared");
  });

program
  .command("status")
  .description("Show connection status")
  .action(async () => {
    const config = loadConfig();

    console.log("\n  Claude Code Sync - Status\n");

    if (!config) {
      console.log("Not configured");
      console.log("   Run 'claude-code-sync login' to set up\n");
      process.exit(1);
    }

    console.log("Configuration:");
    console.log(`  Convex URL: ${config.convexUrl}`);
    console.log(`  API Key:    ${maskApiKey(config.apiKey)}`);
    console.log(`  Auto Sync:  ${config.autoSync !== false ? "enabled" : "disabled"}`);
    console.log(`  Tool Calls: ${config.syncToolCalls !== false ? "enabled" : "disabled"}`);
    console.log(`  Thinking:   ${config.syncThinking ? "enabled" : "disabled"}`);

    console.log("\nTesting connection...");
    const client = new SyncClient(config);
    const connected = await client.testConnection();

    if (connected) {
      console.log("Connected to Convex backend\n");
    } else {
      console.log("Error: Could not connect to Convex backend\n");
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Show current configuration")
  .option("--json", "Output as JSON")
  .action((options: { json?: boolean }) => {
    const config = loadConfig();

    if (!config) {
      if (options.json) {
        console.log(JSON.stringify({ configured: false }));
      } else {
        console.log("Not configured. Run 'claude-code-sync login' to set up.");
      }
      return;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            configured: true,
            convexUrl: config.convexUrl,
            apiKey: maskApiKey(config.apiKey),
            autoSync: config.autoSync !== false,
            syncToolCalls: config.syncToolCalls !== false,
            syncThinking: config.syncThinking === true,
          },
          null,
          2
        )
      );
    } else {
      console.log("\n  Current Configuration\n");
      console.log(`Convex URL:  ${config.convexUrl}`);
      console.log(`API Key:     ${maskApiKey(config.apiKey)}`);
      console.log(`Auto Sync:   ${config.autoSync !== false}`);
      console.log(`Tool Calls:  ${config.syncToolCalls !== false}`);
      console.log(`Thinking:    ${config.syncThinking === true}`);
      console.log(`\nConfig file: ~/.config/claude-code-sync/config.json\n`);
    }
  });

program
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    const config = loadConfig();

    if (!config) {
      console.error("Not configured. Run 'claude-code-sync login' first.");
      process.exit(1);
    }

    const validKeys = ["autoSync", "syncToolCalls", "syncThinking"];
    if (!validKeys.includes(key)) {
      console.error(`Invalid key. Valid keys: ${validKeys.join(", ")}`);
      process.exit(1);
    }

    const boolValue = value === "true" || value === "1" || value === "yes";
    
    // Type-safe config update
    if (key === "autoSync") {
      config.autoSync = boolValue;
    } else if (key === "syncToolCalls") {
      config.syncToolCalls = boolValue;
    } else if (key === "syncThinking") {
      config.syncThinking = boolValue;
    }

    saveConfig(config);
    console.log(`Set ${key} = ${boolValue}`);
  });

// ============================================================================
// Setup Command (configures Claude Code hooks)
// ============================================================================

// Claude Code hooks configuration
const CLAUDE_HOOKS_CONFIG = {
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: "claude-code-sync hook SessionStart",
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: "claude-code-sync hook SessionEnd",
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: "claude-code-sync hook UserPromptSubmit",
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: "claude-code-sync hook PostToolUse",
          },
        ],
      },
    ],
    Stop: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: "claude-code-sync hook Stop",
          },
        ],
      },
    ],
  },
};

program
  .command("setup")
  .description("Add hooks to Claude Code settings (configures ~/.claude/settings.json)")
  .option("--force", "Overwrite existing hooks configuration")
  .action(async (options: { force?: boolean }) => {
    const claudeDir = path.join(process.env.HOME || "~", ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");

    console.log("\n  Claude Code Sync - Setup\n");

    // Check if plugin credentials are configured
    const config = loadConfig();
    if (!config) {
      console.log("Warning: Plugin not configured yet.");
      console.log("   Run 'claude-code-sync login' first to set up credentials.\n");
    }

    // Create .claude directory if needed
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
      console.log("Created ~/.claude directory");
    }

    // Check for existing settings
    let existingSettings: Record<string, unknown> = {};
    let hasExistingHooks = false;

    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf-8");
        existingSettings = JSON.parse(content);
        hasExistingHooks = !!existingSettings.hooks;
        console.log("Found existing settings.json");
      } catch {
        console.log("Warning: Could not parse existing settings.json, will create new one");
      }
    }

    // Handle existing hooks
    if (hasExistingHooks && !options.force) {
      console.log("\nExisting hooks configuration found.");
      console.log("   Use --force to overwrite, or manually merge the hooks.\n");
      console.log("To manually add, include these hooks in your settings.json:");
      console.log(JSON.stringify(CLAUDE_HOOKS_CONFIG, null, 2));
      process.exit(1);
    }

    // Merge settings
    const newSettings = {
      ...existingSettings,
      ...CLAUDE_HOOKS_CONFIG,
    };

    // Write settings
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
      console.log("\nClaude Code hooks configured!");
      console.log(`   Settings file: ${settingsPath}`);
      console.log("\nSetup complete. Sessions will sync automatically.\n");
    } catch (error) {
      console.error("Error writing settings:", error);
      process.exit(1);
    }
  });

program
  .command("verify")
  .description("Verify credentials and Claude Code configuration")
  .action(async () => {
    console.log("\n  OpenSync Setup Verification\n");

    // Check credentials
    const config = loadConfig();
    if (config) {
      console.log("Credentials: OK");
      console.log(`   Convex URL: ${config.convexUrl}`);
      console.log(`   API Key: ${maskApiKey(config.apiKey)}`);
    } else {
      console.log("Credentials: NOT CONFIGURED");
      console.log("   Run 'claude-code-sync login' to set up");
    }

    // Check Claude Code config
    const settingsPath = path.join(process.env.HOME || "~", ".claude", "settings.json");
    let hooksConfigured = false;

    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(content);
        hooksConfigured = !!settings.hooks?.SessionStart;
      } catch {
        // Ignore parse errors
      }
    }

    console.log("");
    if (hooksConfigured) {
      console.log("Claude Code Config: OK");
      console.log(`   Config file: ${settingsPath}`);
      console.log("   Hooks registered: claude-code-sync");
    } else {
      console.log("Claude Code Config: NOT CONFIGURED");
      console.log("   Run 'claude-code-sync setup' to configure hooks");
    }

    // Test connection if credentials exist
    if (config) {
      console.log("\nTesting connection...");
      const client = new SyncClient(config);
      const connected = await client.testConnection();
      if (connected) {
        console.log("Connection: OK\n");
      } else {
        console.log("Connection: FAILED\n");
        process.exit(1);
      }
    }

    if (config && hooksConfigured) {
      console.log("Ready! Start Claude Code and sessions will sync automatically.\n");
    } else {
      console.log("");
      process.exit(1);
    }
  });

// ============================================================================
// Hook Command (for Claude Code integration)
// ============================================================================

program
  .command("hook <event>")
  .description("Handle Claude Code hook events (reads stdin)")
  .action(async (event: string) => {
    const config = loadConfig();

    if (!config) {
      // Exit silently if not configured (don't block Claude Code)
      process.exit(0);
    }

    if (config.autoSync === false) {
      process.exit(0);
    }

    // Read JSON input from stdin
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    if (!input.trim()) {
      process.exit(0);
    }

    try {
      const data = JSON.parse(input);
      const client = new SyncClient(config);

      switch (event) {
        case "SessionStart": {
          const session = {
            sessionId: data.session_id,
            source: "claude-code" as const,
            cwd: data.cwd,
            permissionMode: data.permission_mode,
            startType: data.source === "startup" ? "new" : data.source,
            startedAt: new Date().toISOString(),
            projectPath: data.cwd,
            projectName: data.cwd ? data.cwd.split("/").pop() : undefined,
          };
          await client.syncSession(session);
          break;
        }

        case "SessionEnd": {
          const session = {
            sessionId: data.session_id,
            source: "claude-code" as const,
            endReason: data.reason,
            endedAt: new Date().toISOString(),
          };
          await client.syncSession(session);
          break;
        }

        case "UserPromptSubmit": {
          const message = {
            sessionId: data.session_id,
            messageId: `${data.session_id}-${Date.now()}`,
            source: "claude-code" as const,
            role: "user" as const,
            content: data.prompt,
            timestamp: new Date().toISOString(),
          };
          await client.syncMessage(message);
          break;
        }

        case "PostToolUse": {
          if (!config.syncToolCalls) break;
          const message = {
            sessionId: data.session_id,
            messageId: `${data.session_id}-tool-${Date.now()}`,
            source: "claude-code" as const,
            role: "assistant" as const,
            toolName: data.tool_name,
            toolArgs: data.tool_input,
            toolResult: data.tool_result?.output || data.tool_result?.error,
            timestamp: new Date().toISOString(),
          };
          await client.syncMessage(message);
          break;
        }

        case "Stop": {
          // Stop event indicates Claude finished responding
          // We could track this but for now just acknowledge
          break;
        }

        default:
          // Unknown event, ignore
          break;
      }

      process.exit(0);
    } catch (error) {
      // Log to stderr but don't block Claude Code
      console.error(`[claude-code-sync] Error: ${error}`);
      process.exit(0);
    }
  });

// Parse and run
program.parse();
