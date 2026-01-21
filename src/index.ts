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
  endReason?: "user_stop" | "max_turns" | "error" | "completed" | "clear" | "logout" | "prompt_input_exit" | "other" | string;
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

export interface MessagePart {
  type: "text" | "tool-call" | "tool-result";
  content: unknown;
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
  parts?: MessagePart[];
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

// Claude Code Hook Types (actual event structure from Claude Code)
export interface ClaudeCodeHooks {
  SessionStart?: (data: SessionStartEvent) => void | Promise<void>;
  UserPromptSubmit?: (data: UserPromptEvent) => void | Promise<void>;
  PostToolUse?: (data: ToolUseEvent) => void | Promise<void>;
  Stop?: (data: StopEvent) => void | Promise<void>;
  SessionEnd?: (data: SessionEndEvent) => void | Promise<void>;
}

// Actual Claude Code hook event interfaces (from documentation)
export interface SessionStartEvent {
  session_id: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
  // Legacy fields (may or may not be provided)
  sessionId?: string;
  cwd?: string;
  model?: string;
}

export interface UserPromptEvent {
  session_id: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "UserPromptSubmit";
  prompt?: string;
  // Legacy fields
  sessionId?: string;
  timestamp?: string;
}

export interface ToolUseEvent {
  session_id: string;
  transcript_path: string;
  tool_name: string;
  permission_mode: string;
  hook_event_name: "PostToolUse";
  // Legacy fields
  sessionId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  durationMs?: number;
}

export interface StopEvent {
  session_id: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  // Legacy fields
  sessionId?: string;
  response?: string;
  tokenUsage?: { input: number; output: number };
  durationMs?: number;
  model?: string;
}

export interface SessionEndEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "SessionEnd";
  reason: "clear" | "logout" | "prompt_input_exit" | "other";
  // Legacy fields
  sessionId?: string;
  endReason?: string;
  messageCount?: number;
  toolCallCount?: number;
  totalTokenUsage?: { input: number; output: number };
  costEstimate?: number;
}

// Transcript entry types for parsing
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
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
  title: string | undefined;
  cwd: string | undefined;
}

/**
 * Parse transcript file to extract model, token usage, and stats
 */
function parseTranscript(transcriptPath: string): TranscriptStats {
  const stats: TranscriptStats = {
    model: undefined,
    inputTokens: 0,
    outputTokens: 0,
    messageCount: 0,
    toolCallCount: 0,
    title: undefined,
    cwd: undefined,
  };

  try {
    if (!fs.existsSync(transcriptPath)) {
      return stats;
    }

    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        // Get cwd and title from first entry that has them
        if (!stats.cwd && entry.cwd) {
          stats.cwd = entry.cwd;
        }
        if (!stats.title && entry.slug) {
          stats.title = entry.slug;
        }

        // Count messages
        if (entry.type === "user") {
          stats.messageCount++;
        }

        // Extract model and tokens from assistant messages
        if (entry.type === "assistant" && entry.message) {
          if (entry.message.model && !stats.model) {
            stats.model = entry.message.model;
          }

          if (entry.message.usage) {
            const usage = entry.message.usage;
            // Sum up all input token types
            stats.inputTokens += usage.input_tokens || 0;
            stats.inputTokens += usage.cache_creation_input_tokens || 0;
            stats.inputTokens += usage.cache_read_input_tokens || 0;
            // Output tokens
            stats.outputTokens += usage.output_tokens || 0;
          }
        }

        // Count tool uses
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
  } catch (error) {
    console.error("[claude-code-sync] Error parsing transcript:", error);
  }

  return stats;
}

// ============================================================================
// Model Pricing & Cost Calculation
// ============================================================================

/**
 * Pricing per million tokens (USD)
 * Source: https://www.anthropic.com/pricing
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-opus-4-5-20251101': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
};

/**
 * Calculate cost from model and token usage
 * Returns 0 if model is unknown or pricing not available
 */
function calculateCost(model: string | undefined, inputTokens: number, outputTokens: number): number {
  if (!model) return 0;

  // Try exact match first
  let pricing = MODEL_PRICING[model];

  // Try partial match if exact match fails
  if (!pricing) {
    const matchingKey = Object.keys(MODEL_PRICING).find(k => model.includes(k) || k.includes(model));
    if (matchingKey) {
      pricing = MODEL_PRICING[matchingKey];
    }
  }

  if (!pricing) return 0;

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
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

  // Transform session data to backend format
  private transformSession(session: SessionData): Record<string, unknown> {
    return {
      externalId: session.sessionId,
      title: session.title,
      projectPath: session.projectPath || session.cwd,
      projectName: session.projectName,
      model: session.model,
      source: session.source,
      promptTokens: session.tokenUsage?.input,
      completionTokens: session.tokenUsage?.output,
      cost: session.costEstimate,
      durationMs: session.endedAt && session.startedAt
        ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
        : undefined,
    };
  }

  // Transform message data to backend format
  private transformMessage(message: MessageData): Record<string, unknown> {
    // Build parts array
    let parts: MessagePart[] | undefined;

    // Use explicit parts if provided
    if (message.parts && message.parts.length > 0) {
      parts = message.parts;
    }
    // Build parts from tool fields for backwards compatibility
    else if (message.toolName) {
      parts = [
        { type: "tool-call", content: { name: message.toolName, args: message.toolArgs } },
        { type: "tool-result", content: { result: message.toolResult } },
      ];
    }

    return {
      sessionExternalId: message.sessionId,
      externalId: message.messageId,
      role: message.role,
      textContent: message.content,
      model: undefined,
      durationMs: message.durationMs,
      source: message.source,
      parts,
    };
  }

  async syncSession(session: SessionData): Promise<void> {
    try {
      const payload = this.transformSession(session);
      await this.request("/sync/session", payload);
    } catch (error) {
      console.error("Failed to sync session:", error);
      throw error;
    }
  }

  async syncMessage(message: MessageData): Promise<void> {
    try {
      const payload = this.transformMessage(message);
      await this.request("/sync/message", payload);
    } catch (error) {
      console.error("Failed to sync message:", error);
      throw error;
    }
  }

  async syncBatch(
    sessions: SessionData[],
    messages: MessageData[]
  ): Promise<void> {
    try {
      const transformedSessions = sessions.map((s) => this.transformSession(s));
      const transformedMessages = messages.map((m) => this.transformMessage(m));
      await this.request("/sync/batch", {
        sessions: transformedSessions,
        messages: transformedMessages,
      });
    } catch (error) {
      console.error("Failed to sync batch:", error);
      throw error;
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

      // Use session_id (new) or sessionId (legacy)
      const sessionId = event.session_id || event.sessionId || "";
      const transcriptPath = event.transcript_path || "";

      console.log(`[claude-code-sync] SessionStart: session=${sessionId}, transcript=${transcriptPath}`);

      const session: SessionData = {
        sessionId,
        source: "claude-code",
        permissionMode: event.permission_mode,
        startedAt: new Date().toISOString(),
      };

      // Store transcript path for later parsing
      if (transcriptPath) {
        client.updateSessionState(sessionId, {
          ...session,
          // Store transcript path in a way we can retrieve it
          projectPath: transcriptPath,  // Temporarily store here
        });
      }

      // Try to get cwd from transcript if available
      if (transcriptPath && fs.existsSync(transcriptPath)) {
        const stats = parseTranscript(transcriptPath);
        if (stats.cwd) {
          session.cwd = stats.cwd;
          session.projectPath = stats.cwd;
          session.projectName = path.basename(stats.cwd);
        }
        if (stats.title) {
          session.title = stats.title;
        }
        if (stats.model) {
          session.model = stats.model;
        }

        // Try to get git info
        if (stats.cwd) {
          try {
            const gitDir = path.join(stats.cwd, ".git");
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
      }

      client.updateSessionState(sessionId, session);
      await client.syncSession(session);
    },

    /**
     * Called when user submits a prompt
     */
    UserPromptSubmit: async (event: UserPromptEvent) => {
      messageCounter++;
      const sessionId = event.session_id || event.sessionId || "";

      const message: MessageData = {
        sessionId,
        messageId: `${sessionId}-msg-${messageCounter}`,
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
      const sessionId = event.session_id || event.sessionId || "";
      const toolName = event.tool_name || event.toolName || "unknown";

      const message: MessageData = {
        sessionId,
        messageId: `${sessionId}-tool-${toolCallCounter}`,
        source: "claude-code",
        role: "assistant",
        toolName,
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
      const sessionId = event.session_id || event.sessionId || "";
      const transcriptPath = event.transcript_path || "";

      // Parse transcript to get latest model and token info
      if (transcriptPath && fs.existsSync(transcriptPath)) {
        const stats = parseTranscript(transcriptPath);
        const currentState = client.getSessionState(sessionId);

        const updates: Partial<SessionData> = {
          tokenUsage: {
            input: stats.inputTokens,
            output: stats.outputTokens,
          },
        };

        if (stats.model && !currentState.model) {
          updates.model = stats.model;
        }
        if (stats.title && !currentState.title) {
          updates.title = stats.title;
        }

        client.updateSessionState(sessionId, updates);
        console.log(`[claude-code-sync] Stop: model=${stats.model}, tokens=${stats.inputTokens}/${stats.outputTokens}`);
      }
    },

    /**
     * Called when session ends
     */
    SessionEnd: async (event: SessionEndEvent) => {
      const sessionId = event.session_id || event.sessionId || "";
      const transcriptPath = event.transcript_path || "";
      const currentState = client.getSessionState(sessionId);

      // Parse transcript to get final stats
      let stats: TranscriptStats = {
        model: currentState.model,
        inputTokens: currentState.tokenUsage?.input || 0,
        outputTokens: currentState.tokenUsage?.output || 0,
        messageCount: event.messageCount || 0,
        toolCallCount: event.toolCallCount || 0,
        title: currentState.title,
        cwd: currentState.cwd,
      };

      if (transcriptPath && fs.existsSync(transcriptPath)) {
        stats = parseTranscript(transcriptPath);
      }

      // Calculate cost from token usage
      let cost = event.costEstimate;
      if (cost === undefined || cost === null || cost === 0) {
        if (stats.model && (stats.inputTokens || stats.outputTokens)) {
          cost = calculateCost(stats.model, stats.inputTokens, stats.outputTokens);
        }
      }

      const session: SessionData = {
        ...currentState,
        sessionId,
        source: "claude-code",
        model: stats.model,
        title: stats.title,
        cwd: stats.cwd || event.cwd,
        projectPath: stats.cwd || event.cwd,
        projectName: stats.cwd ? path.basename(stats.cwd) : undefined,
        endReason: event.reason || event.endReason,
        messageCount: stats.messageCount,
        toolCallCount: stats.toolCallCount,
        tokenUsage: {
          input: stats.inputTokens,
          output: stats.outputTokens,
        },
        costEstimate: cost,
        endedAt: new Date().toISOString(),
      };

      console.log(`[claude-code-sync] SessionEnd: model=${session.model}, cost=$${cost?.toFixed(4)}, tokens=${stats.inputTokens}/${stats.outputTokens}`);

      await client.syncSession(session);
      client.clearSessionState(sessionId);

      console.log(`[claude-code-sync] Session synced: ${stats.messageCount} messages, ${stats.toolCallCount} tool calls`);
    },
  };
}

// Default export for Claude Code plugin system
export default createPlugin;
