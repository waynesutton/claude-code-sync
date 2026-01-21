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
import * as os from "os";
import {
  loadConfig,
  saveConfig,
  clearConfig,
  SyncClient,
  Config,
  SessionData,
  MessageData,
} from "./index";

// ============================================================================
// Transcript Parsing (duplicated from index.ts for CLI use)
// ============================================================================

interface TranscriptEntry {
  type: string;
  message?: {
    model?: string;
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    content?: unknown;
  };
  sessionId?: string;
  cwd?: string;
  slug?: string;
}

interface TranscriptStats {
  model: string | undefined;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
  title: string | undefined;
  cwd: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  durationMs: number | undefined;
}

function parseTranscript(transcriptPath: string): TranscriptStats {
  const stats: TranscriptStats = {
    model: undefined,
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    messageCount: 0,
    toolCallCount: 0,
    title: undefined,
    cwd: undefined,
    startedAt: undefined,
    endedAt: undefined,
    durationMs: undefined,
  };

  try {
    if (!fs.existsSync(transcriptPath)) {
      return stats;
    }

    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");
    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry & { timestamp?: string };

        // Track timestamps for duration
        if (entry.timestamp) {
          if (!firstTimestamp) {
            firstTimestamp = entry.timestamp;
          }
          lastTimestamp = entry.timestamp;
        }

        if (!stats.cwd && entry.cwd) {
          stats.cwd = entry.cwd;
        }
        if (!stats.title && entry.slug) {
          stats.title = entry.slug;
        }

        if (entry.type === "user") {
          stats.messageCount++;
        }

        if (entry.type === "assistant" && entry.message) {
          if (entry.message.model && !stats.model) {
            stats.model = entry.message.model;
          }

          if (entry.message.usage) {
            const usage = entry.message.usage;
            // Track tokens separately for proper cost calculation
            stats.inputTokens += usage.input_tokens || 0;
            stats.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
            stats.cacheReadTokens += usage.cache_read_input_tokens || 0;
            stats.outputTokens += usage.output_tokens || 0;
          }
        }

        if (entry.type === "assistant" && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part && typeof part === "object" && "type" in part && part.type === "tool_use") {
                stats.toolCallCount++;
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Calculate duration from timestamps
    if (firstTimestamp && lastTimestamp) {
      stats.startedAt = firstTimestamp;
      stats.endedAt = lastTimestamp;
      const startMs = new Date(firstTimestamp).getTime();
      const endMs = new Date(lastTimestamp).getTime();
      if (!isNaN(startMs) && !isNaN(endMs)) {
        stats.durationMs = endMs - startMs;
      }
    }
  } catch (error) {
    console.error(`[claude-code-sync] Error parsing transcript: ${error}`);
  }

  return stats;
}

// Pricing per million tokens (USD) - includes cache pricing
const MODEL_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-5-20251101': { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
};

function calculateCost(model: string | undefined, stats: TranscriptStats): number {
  if (!model) return 0;
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const matchingKey = Object.keys(MODEL_PRICING).find(k => model.includes(k) || k.includes(model));
    if (matchingKey) {
      pricing = MODEL_PRICING[matchingKey];
    }
  }
  if (!pricing) return 0;

  // Calculate cost with proper cache pricing
  const inputCost = stats.inputTokens * pricing.input;
  const cacheWriteCost = stats.cacheCreationTokens * pricing.cacheWrite;
  const cacheReadCost = stats.cacheReadTokens * pricing.cacheRead;
  const outputCost = stats.outputTokens * pricing.output;

  return (inputCost + cacheWriteCost + cacheReadCost + outputCost) / 1_000_000;
}

// Types for Claude Code hook event data from stdin
interface HookSessionStartData {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  source?: string;
}

interface HookSessionEndData {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  reason?: string;
}

interface HookUserPromptData {
  session_id: string;
  transcript_path?: string;
  prompt: string;
}

interface HookToolUseData {
  session_id: string;
  transcript_path?: string;
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_result?: {
    output?: string;
    error?: string;
  };
}

interface HookStopData {
  session_id: string;
  transcript_path?: string;
}

// Types for Claude Code settings.json
interface ClaudeSettings {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

// Type for package.json version field
interface PackageJson {
  version?: string;
}

// Read version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PackageJson;
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
    console.log("Get your API key from your OpenSync.dev Settings page, starts with osk_. Enter it here:");
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
    console.log("\nNext step: Run the setup command to configure Claude Code hooks:\n");
    console.log("   claude-code-sync setup\n");
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
    let existingSettings: ClaudeSettings = {};
    let hasExistingHooks = false;

    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf-8");
        existingSettings = JSON.parse(content) as ClaudeSettings;
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
        const settings = JSON.parse(content) as ClaudeSettings;
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
// Sync Test Command (test connectivity)
// ============================================================================

program
  .command("synctest")
  .description("Test connectivity and create a test session")
  .action(async () => {
    const config = loadConfig();

    console.log("\n  Claude Code Sync - Connection Test\n");

    if (!config) {
      console.log("Not configured");
      console.log("   Run 'claude-code-sync login' to set up\n");
      process.exit(1);
    }

    console.log("Configuration:");
    console.log(`  Convex URL: ${config.convexUrl}`);
    console.log(`  API Key:    ${maskApiKey(config.apiKey)}`);

    console.log("\nTesting connection...");
    const client = new SyncClient(config);
    const connected = await client.testConnection();

    if (connected) {
      console.log("Connection: OK");
      
      // Create a test session to verify full sync works
      console.log("\nCreating test session...");
      try {
        const testSession = {
          sessionId: `test-${Date.now()}`,
          source: "claude-code" as const,
          title: "Connection Test",
          projectName: "synctest",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        };
        await client.syncSession(testSession);
        console.log("Test session created successfully");
        console.log("\nSync test passed. Ready to sync Claude Code sessions.\n");
      } catch (error) {
        console.log(`Test session failed: ${error}`);
        console.log("\nConnection works but sync may have issues.\n");
        process.exit(1);
      }
    } else {
      console.log("Connection: FAILED");
      console.log("\nCheck your Convex URL and API key.\n");
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
      const client = new SyncClient(config);

      switch (event) {
        case "SessionStart": {
          const data = JSON.parse(input) as HookSessionStartData;

          // Parse transcript if available to get initial info
          let stats: TranscriptStats | undefined;
          if (data.transcript_path && fs.existsSync(data.transcript_path)) {
            stats = parseTranscript(data.transcript_path);
          }

          const cwd = stats?.cwd || data.cwd;
          const session: SessionData = {
            sessionId: data.session_id,
            source: "claude-code",
            cwd: cwd,
            model: stats?.model,
            title: stats?.title,
            permissionMode: data.permission_mode,
            startType: data.source === "startup" ? "new" : (data.source as SessionData["startType"]),
            startedAt: new Date().toISOString(),
            projectPath: cwd,
            projectName: cwd ? path.basename(cwd) : undefined,
          };

          // Try to get git branch
          if (cwd) {
            try {
              const gitDir = path.join(cwd, ".git");
              if (fs.existsSync(gitDir)) {
                const headFile = path.join(gitDir, "HEAD");
                if (fs.existsSync(headFile)) {
                  const head = fs.readFileSync(headFile, "utf-8").trim();
                  if (head.startsWith("ref: refs/heads/")) {
                    session.gitBranch = head.replace("ref: refs/heads/", "");
                  }
                }
              }
            } catch {
              // Ignore git errors
            }
          }

          await client.syncSession(session);
          break;
        }

        case "SessionEnd": {
          const data = JSON.parse(input) as HookSessionEndData;

          // Parse transcript to get model, tokens, and stats
          let stats: TranscriptStats = {
            model: undefined,
            inputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            outputTokens: 0,
            messageCount: 0,
            toolCallCount: 0,
            title: undefined,
            cwd: data.cwd,
            startedAt: undefined,
            endedAt: undefined,
            durationMs: undefined,
          };

          if (data.transcript_path && fs.existsSync(data.transcript_path)) {
            stats = parseTranscript(data.transcript_path);
            console.error(`[claude-code-sync] Parsed transcript: model=${stats.model}, tokens=${stats.inputTokens}/${stats.outputTokens}`);
          }

          // Calculate cost from tokens (with proper cache pricing)
          let cost: number | undefined;
          if (stats.model && (stats.inputTokens || stats.outputTokens || stats.cacheReadTokens)) {
            cost = calculateCost(stats.model, stats);
          }

          const cwd = stats.cwd || data.cwd;
          const totalInputTokens = stats.inputTokens + stats.cacheCreationTokens + stats.cacheReadTokens;
          const session: SessionData = {
            sessionId: data.session_id,
            source: "claude-code",
            model: stats.model,
            title: stats.title,
            cwd: cwd,
            projectPath: cwd,
            projectName: cwd ? path.basename(cwd) : undefined,
            endReason: data.reason,
            messageCount: stats.messageCount,
            toolCallCount: stats.toolCallCount,
            tokenUsage: {
              input: totalInputTokens,
              output: stats.outputTokens,
            },
            costEstimate: cost,
            startedAt: stats.startedAt,
            endedAt: stats.endedAt || new Date().toISOString(),
          };

          const durationMin = stats.durationMs ? Math.round(stats.durationMs / 60000) : 0;
          console.error(`[claude-code-sync] SessionEnd: model=${session.model}, cost=$${cost?.toFixed(4) || 0}, tokens=${totalInputTokens}in/${stats.outputTokens}out, duration=${durationMin}min`);
          await client.syncSession(session);
          break;
        }

        case "UserPromptSubmit": {
          const data = JSON.parse(input) as HookUserPromptData;
          const message: MessageData = {
            sessionId: data.session_id,
            messageId: `${data.session_id}-${Date.now()}`,
            source: "claude-code",
            role: "user",
            content: data.prompt,
            timestamp: new Date().toISOString(),
          };
          await client.syncMessage(message);
          break;
        }

        case "PostToolUse": {
          if (!config.syncToolCalls) break;
          const data = JSON.parse(input) as HookToolUseData;
          const message: MessageData = {
            sessionId: data.session_id,
            messageId: `${data.session_id}-tool-${Date.now()}`,
            source: "claude-code",
            role: "assistant",
            toolName: data.tool_name,
            toolArgs: data.tool_input,
            toolResult: data.tool_result?.output || data.tool_result?.error,
            timestamp: new Date().toISOString(),
          };
          await client.syncMessage(message);
          break;
        }

        case "Stop": {
          // Stop event indicates Claude finished responding - sync the latest assistant message
          const data = JSON.parse(input) as HookStopData;

          if (data.transcript_path && fs.existsSync(data.transcript_path)) {
            // Read transcript to get the latest assistant message
            const content = fs.readFileSync(data.transcript_path, "utf-8");
            const lines = content.trim().split("\n");

            // Find the last assistant message with text content
            let lastAssistantText = "";
            let lastModel = "";

            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const entry = JSON.parse(lines[i]);
                if (entry.type === "assistant" && entry.message) {
                  if (entry.message.model) {
                    lastModel = entry.message.model;
                  }
                  // Look for text content in the message
                  if (entry.message.content && Array.isArray(entry.message.content)) {
                    for (const part of entry.message.content) {
                      if (part && part.type === "text" && part.text) {
                        lastAssistantText = part.text;
                        break;
                      }
                    }
                  }
                  if (lastAssistantText) break;
                }
              } catch {
                // Skip malformed lines
              }
            }

            if (lastAssistantText) {
              const message: MessageData = {
                sessionId: data.session_id,
                messageId: `${data.session_id}-assistant-${Date.now()}`,
                source: "claude-code",
                role: "assistant",
                content: lastAssistantText,
                timestamp: new Date().toISOString(),
              };
              await client.syncMessage(message);
            }
          }
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
