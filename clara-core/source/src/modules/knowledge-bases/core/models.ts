/**
 * src/modules/knowledge-bases/core/models.ts
 * TypeScript types for knowledge bases and assistant configs.
 */

// ── Knowledge Base ─────────────────────────────────────────────────────────────

export type KnowledgeBase = {
  id: string;
  agentId: string;
  name: string;
  description: string | null;
  qdrantCollection: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CreateKbInput  = { name: string; description?: string; };
export type UpdateKbInput  = Partial<Pick<CreateKbInput, "name" | "description"> & { status: "active" | "archived"; }>;

// ── Assistant Config ──────────────────────────────────────────────────────────

/** Managed FAQ entry — injected into the system prompt as a canonical Q/A
 *  block (ElevenLabs-style FAQ tab). Stored on the assistant config so it
 *  flows through the draft → version → publish pipeline like every other
 *  persona field. */
export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type AssistantConfig = {
  id: string;
  agentId: string;

  // Identity
  assistantName: string;
  avatarUrl: string | null;

  // Behaviour
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];

  // FAQ (managed canonical Q/A — injected into the system prompt)
  faqItems?: FaqItem[];

  // Language
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;

  // Voice
  voiceId: string;
  speed: number;

  // Generation
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;

  // Branding / colours
  primaryColour: string;
  accentColour: string;
  launcherColour: string;

  // Widget layout & design
  widgetTheme: "light" | "dark";
  widgetPosition: "bottom-right" | "bottom-left";
  widgetButtonSize: number;
  widgetBorderRadius: number;
  widgetFontFamily: string;
  widgetChatHeight: number;
  widgetShowBranding: boolean;
  widgetLauncherLabel: string | null;
  widgetMode: "floating" | "inline" | "headless";

  // ── Extended deep design fields ─────────────────────────────────────────────
  // Header
  headerBg: string | null;
  headerTextColor: string;
  headerHeight: number;
  headerBlur: boolean;
  showStatusDot: boolean;
  statusDotColor: string;
  avatarShape: "circle" | "rounded" | "square";

  // Chat area
  chatAreaBg: string | null;

  // User bubble
  userBubbleBg: string | null;
  userBubbleText: string;
  userBubbleRadius: string;
  userBubblePadding: string;
  userBubbleShadow: string;

  // Bot bubble
  botBubbleBg: string | null;
  botBubbleText: string | null;
  botBubbleRadius: string;
  botBubbleBorder: string | null;
  botBubblePadding: string;
  botBubbleShadow: string;

  // Message list
  messageGap: number;
  messageMaxWidth: number;
  messageFontSize: number;
  messageLineHeight: number;

  // Timestamps
  showTimestamps: boolean;
  timestampColor: string;
  timestampFontSize: number;

  // Typing indicator
  typingDotColor: string;
  typingDotSize: number;

  // Input area
  inputBg: string | null;
  inputBorder: string | null;
  inputBorderFocus: string | null;
  inputRadius: number;
  inputTextColor: string | null;
  inputPlaceholderColor: string | null;
  inputPadding: string;
  inputAreaBg: string | null;
  inputAreaBorder: string | null;

  // Send button
  sendBtnBg: string | null;
  sendBtnHoverBg: string | null;
  sendBtnTextColor: string;
  sendBtnRadius: number;
  sendBtnSize: number;

  // Scrollbar
  scrollbarWidth: number;
  scrollbarColor: string;
  scrollbarTrackColor: string;

  // Footer
  footerBg: string | null;
  footerTextColor: string | null;

  // Animations
  animationsEnabled: boolean;
  messageAnimationStyle: "fade" | "slide" | "pop" | "none";

  // Advanced code overrides
  customCss: string | null;
  customLauncherSvg: string | null;
  customHeaderHtml: string | null;
  customFooterHtml: string | null;
  customThemeCss: string | null;
  customInjectJs: string | null;
  customPoweredBy: string | null;

  // Voice mode design
  voiceBtnBg: string | null;
  voiceBtnSize: number;
  voiceBtnRadius: number;
  voiceBtnActiveColor: string | null;
  voicePanelBg: string | null;
  voiceWaveColor: string | null;

  createdAt: string;
  updatedAt: string;
};

/** Full replace (PUT) */
export type PutAssistantConfigInput = Omit<AssistantConfig, "id" | "agentId" | "createdAt" | "updatedAt">;

/** Partial update (PATCH) */
export type PatchAssistantConfigInput = Partial<PutAssistantConfigInput>;
