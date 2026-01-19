/**
 * Claude Code Sync Plugin
 *
 * Syncs Claude Code sessions to OpenSync dashboard.
 * Uses API Key authentication (no browser OAuth required).
 *
 * Install: npm install -g claude-code-sync
 * Configure: claude-code-sync login
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Types
// ============================================================================

export interface Config {
  convexUrl: string;
  apiKey: string;
  autoSync?: boolean;
  syncToolCalls?: boolean;
  syncThinking?: boolean;
}

export interface SessionData {
  sessionId: string;
  source: "claude-code";
  title?: string;
  projectPath?: string;
  projectName?: string;
  cwd?: string;
  gitBranch?: string;
  gitRepo?: string;
  model?: string;
  startType?: "new" | "resume" | "continue";
  endReason?: "user_stop" | "max_turns" | "error" | "completed";
  thinkingEnabled?: boolean;
  permissionMode?: string;
  mcpServers?: string[];
  messageCount?: number;
  toolCallCount?: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  costEstimate?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface MessageData {
  sessionId: string;
  messageId: string;
  source: "claude-code";
  role: "user" | "assistant" | "system";
  content?: string;
  thinkingContent?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  durationMs?: number;
  tokenCount?: number;
  timestamp?: string;
}

export interface ToolUseData {
  sessionId: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  durationMs?: number;
  timestamp?: string;
}

// Claude Code Hook Types
export interface ClaudeCodeHooks {
  SessionStart?: (data: SessionStartEvent) => void | Promise<void>;
  UserPromptSubmit?: (data: UserPromptEvent) => void | Promise<void>;
  PostToolUse?: (data: ToolUseEvent) => void | Promise<void>;
  Stop?: (data: StopEvent) => void | Promise<void>;
  SessionEnd?: (data: SessionEndEvent) => void | Promise<void>;
}

export interface SessionStartEvent {
  sessionId: string;
  cwd: string;
  model: string;
  startType: "new" | "resume" | "continue";
  thinkingEnabled?: boolean;
  permissionMode?: string;
  mcpServers?: string[];
}

export interface UserPromptEvent {
  sessionId: string;
  prompt: string;
  timestamp: string;
}

export interface ToolUseEvent {
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  durationMs: number;
}

export interface StopEvent {
  sessionId: string;
  response: string;
  tokenUsage: {
    input: number;
    output: number;
  };
  durationMs: number;
}

export interface SessionEndEvent {
  sessionId: string;
  endReason: "user_stop" | "max_turns" | "error" | "completed";
  messageCount: number;
  toolCallCount: number;
  totalTokenUsage: {
    input: number;
    output: number;
  };
  costEstimate: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), ".config", "claude-code-sync");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): Config | null {
  // Check environment variables first
  const envUrl = process.env.CLAUDE_SYNC_CONVEX_URL;
  const envKey = process.env.CLAUDE_SYNC_API_KEY;

  if (envUrl && envKey) {
    return {
      convexUrl: normalizeConvexUrl(envUrl),
      apiKey: envKey,
      autoSync: process.env.CLAUDE_SYNC_AUTO_SYNC !== "false",
      syncToolCalls: process.env.CLAUDE_SYNC_TOOL_CALLS !== "false",
      syncThinking: process.env.CLAUDE_SYNC_THINKING === "true",
    };
  }

  // Fall back to config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const config = JSON.parse(data) as Config;
      config.convexUrl = normalizeConvexUrl(config.convexUrl);
      return config;
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }

  return null;
}

export function saveConfig(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
    throw error;
  }
}

export function clearConfig(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  } catch (error) {
    console.error("Error clearing config:", error);
  }
}

function normalizeConvexUrl(url: string): string {
  // Convert .convex.cloud to .convex.site for API calls
  return url.replace(".convex.cloud", ".convex.site");
}

// ============================================================================
// Sync Client
// ============================================================================

export class SyncClient {
  private config: Config;
  private siteUrl: string;
  private sessionCache: Map<string, Partial<SessionData>> = new Map();

  constructor(config: Config) {
    this.config = config;
    // Normalize URL to .convex.site for HTTP endpoints
    // Supports both .convex.cloud and .convex.site input URLs
    this.siteUrl = config.convexUrl.replace(".convex.cloud", ".convex.site");
  }

  private async request(endpoint: string, data: unknown): Promise<unknown> {
    const url = `${this.siteUrl}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sync failed: ${response.status} - ${text}`);
    }

    return response.json();
  }

  async syncSession(session: SessionData): Promise<void> {
    try {
      await this.request("/sync/session", session);
    } catch (error) {
      console.error("Failed to sync session:", error);
    }
  }

  async syncMessage(message: MessageData): Promise<void> {
    try {
      await this.request("/sync/message", message);
    } catch (error) {
      console.error("Failed to sync message:", error);
    }
  }

  async syncBatch(
    sessions: SessionData[],
    messages: MessageData[]
  ): Promise<void> {
    try {
      await this.request("/sync/batch", { sessions, messages });
    } catch (error) {
      console.error("Failed to sync batch:", error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.siteUrl}/health`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  // Session state management
  getSessionState(sessionId: string): Partial<SessionData> {
    return this.sessionCache.get(sessionId) || {};
  }

  updateSessionState(
    sessionId: string,
    updates: Partial<SessionData>
  ): void {
    const current = this.sessionCache.get(sessionId) || {};
    this.sessionCache.set(sessionId, { ...current, ...updates });
  }

  clearSessionState(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }
}

// ============================================================================
// Plugin Export
// ============================================================================

/**
 * Claude Code Plugin Entry Point
 *
 * This function is called by Claude Code to register the plugin.
 * It returns hook handlers that fire at key points in the session lifecycle.
 */
export function createPlugin(): ClaudeCodeHooks | null {
  const config = loadConfig();

  if (!config) {
    console.log(
      "[claude-code-sync] Not configured. Run 'claude-code-sync login' to set up."
    );
    return null;
  }

  if (config.autoSync === false) {
    console.log("[claude-code-sync] Auto-sync disabled in config.");
    return null;
  }

  const client = new SyncClient(config);
  let messageCounter = 0;
  let toolCallCounter = 0;

  console.log("[claude-code-sync] Plugin loaded. Sessions will sync to OpenSync.");

  return {
    /**
     * Called when a new session starts
     */
    SessionStart: async (event: SessionStartEvent) => {
      messageCounter = 0;
      toolCallCounter = 0;

      const session: SessionData = {
        sessionId: event.sessionId,
        source: "claude-code",
        cwd: event.cwd,
        model: event.model,
        startType: event.startType,
        thinkingEnabled: event.thinkingEnabled,
        permissionMode: event.permissionMode,
        mcpServers: event.mcpServers,
        startedAt: new Date().toISOString(),
      };

      // Extract project info from cwd
      if (event.cwd) {
        session.projectPath = event.cwd;
        session.projectName = path.basename(event.cwd);

        // Try to get git info
        try {
          const gitDir = path.join(event.cwd, ".git");
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

      client.updateSessionState(event.sessionId, session);
      await client.syncSession(session);
    },

    /**
     * Called when user submits a prompt
     */
    UserPromptSubmit: async (event: UserPromptEvent) => {
      messageCounter++;

      const message: MessageData = {
        sessionId: event.sessionId,
        messageId: `${event.sessionId}-msg-${messageCounter}`,
        source: "claude-code",
        role: "user",
        content: event.prompt,
        timestamp: event.timestamp || new Date().toISOString(),
      };

      await client.syncMessage(message);
    },

    /**
     * Called after each tool use
     */
    PostToolUse: async (event: ToolUseEvent) => {
      if (!config.syncToolCalls) return;

      toolCallCounter++;
      messageCounter++;

      const message: MessageData = {
        sessionId: event.sessionId,
        messageId: `${event.sessionId}-tool-${toolCallCounter}`,
        source: "claude-code",
        role: "assistant",
        toolName: event.toolName,
        toolArgs: event.args,
        toolResult: event.result,
        durationMs: event.durationMs,
        timestamp: new Date().toISOString(),
      };

      await client.syncMessage(message);
    },

    /**
     * Called when Claude stops responding
     */
    Stop: async (event: StopEvent) => {
      messageCounter++;

      const message: MessageData = {
        sessionId: event.sessionId,
        messageId: `${event.sessionId}-msg-${messageCounter}`,
        source: "claude-code",
        role: "assistant",
        content: event.response,
        tokenCount: event.tokenUsage.input + event.tokenUsage.output,
        durationMs: event.durationMs,
        timestamp: new Date().toISOString(),
      };

      // Update session state with token usage
      const currentState = client.getSessionState(event.sessionId);
      const currentTokens = currentState.tokenUsage || { input: 0, output: 0 };
      client.updateSessionState(event.sessionId, {
        tokenUsage: {
          input: currentTokens.input + event.tokenUsage.input,
          output: currentTokens.output + event.tokenUsage.output,
        },
      });

      await client.syncMessage(message);
    },

    /**
     * Called when session ends
     */
    SessionEnd: async (event: SessionEndEvent) => {
      const currentState = client.getSessionState(event.sessionId);

      const session: SessionData = {
        ...currentState,
        sessionId: event.sessionId,
        source: "claude-code",
        endReason: event.endReason,
        messageCount: event.messageCount,
        toolCallCount: event.toolCallCount,
        tokenUsage: event.totalTokenUsage,
        costEstimate: event.costEstimate,
        endedAt: new Date().toISOString(),
      };

      await client.syncSession(session);
      client.clearSessionState(event.sessionId);

      console.log(
        `[claude-code-sync] Session synced: ${event.messageCount} messages, ${event.toolCallCount} tool calls`
      );
    },
  };
}

// Default export for Claude Code plugin system
export default createPlugin;
