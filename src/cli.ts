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
import {
  loadConfig,
  saveConfig,
  clearConfig,
  SyncClient,
  Config,
} from "./index";

const program = new Command();

program
  .name("claude-code-sync")
  .description("Sync Claude Code sessions to OpenSync dashboard")
  .version("0.1.1");

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
    console.log("\n🔐 Claude Code Sync - Login\n");
    console.log("Get your API key from your OpenSync dashboard:");
    console.log("  1. Go to Settings");
    console.log("  2. Click 'Generate API Key'");
    console.log("  3. Copy the key (starts with osk_)\n");

    const convexUrl = await prompt("Convex URL (e.g., https://your-project.convex.cloud): ");

    if (!convexUrl) {
      console.error("❌ Convex URL is required");
      process.exit(1);
    }

    if (!convexUrl.includes("convex.cloud") && !convexUrl.includes("convex.site")) {
      console.error("❌ Invalid Convex URL. Must contain convex.cloud or convex.site");
      process.exit(1);
    }

    const apiKey = await prompt("API Key (osk_...): ");

    if (!apiKey) {
      console.error("❌ API Key is required");
      process.exit(1);
    }

    if (!apiKey.startsWith("osk_")) {
      console.error("❌ Invalid API Key. Must start with osk_");
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
    console.log("\n⏳ Testing connection...");
    const client = new SyncClient(config);
    const connected = await client.testConnection();

    if (!connected) {
      console.error("❌ Could not connect to Convex backend");
      console.error("   Check your URL and try again");
      process.exit(1);
    }

    // Save config
    saveConfig(config);
    console.log("\n✅ Configuration saved!");
    console.log(`   URL: ${convexUrl}`);
    console.log(`   Key: ${maskApiKey(apiKey)}`);
    console.log("\n📦 Add the plugin to your Claude Code config to start syncing.\n");
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(() => {
    clearConfig();
    console.log("✅ Credentials cleared");
  });

program
  .command("status")
  .description("Show connection status")
  .action(async () => {
    const config = loadConfig();

    console.log("\n📊 Claude Code Sync - Status\n");

    if (!config) {
      console.log("❌ Not configured");
      console.log("   Run 'claude-code-sync login' to set up\n");
      process.exit(1);
    }

    console.log("Configuration:");
    console.log(`  Convex URL: ${config.convexUrl}`);
    console.log(`  API Key:    ${maskApiKey(config.apiKey)}`);
    console.log(`  Auto Sync:  ${config.autoSync !== false ? "enabled" : "disabled"}`);
    console.log(`  Tool Calls: ${config.syncToolCalls !== false ? "enabled" : "disabled"}`);
    console.log(`  Thinking:   ${config.syncThinking ? "enabled" : "disabled"}`);

    console.log("\n⏳ Testing connection...");
    const client = new SyncClient(config);
    const connected = await client.testConnection();

    if (connected) {
      console.log("✅ Connected to Convex backend\n");
    } else {
      console.log("❌ Could not connect to Convex backend\n");
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
      console.log("\n📋 Current Configuration\n");
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
    console.log(`✅ Set ${key} = ${boolValue}`);
  });

// Parse and run
program.parse();
