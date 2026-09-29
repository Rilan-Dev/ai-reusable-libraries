import type { AIPlatformAdapters } from "./adapter-registry.js";
import { CAPABILITY_BINDINGS } from "./capability-map.js";
import { UI_REFERENCE_INVENTORY } from "./ui-inventory.js";

export interface AdapterValidationResult {
  ok: boolean;
  missingAdapters: string[];
  uiCoverageGaps: string[];
  capabilities: number;
  uiReferences: number;
}

export function validateAIPlatformAdapters(adapters: AIPlatformAdapters): AdapterValidationResult {
  const required: Array<[keyof AIPlatformAdapters, string]> = [
    ["identity", "identity"], ["providers", "providers"], ["agents", "agents"],
    ["tools", "tools"], ["mcp", "mcp"], ["integrations", "integrations"],
    ["workspace", "workspace"], ["processes", "processes"], ["sandbox", "sandbox"],
    ["context", "context"], ["rag", "rag"], ["transport", "chat"],
    ["voice", "voice-realtime"], ["secrets", "secrets"],
  ];

  const missingAdapters = required
    .filter(([key]) => adapters[key] == null)
    .map(([, capability]) => capability);

  // Some runtime capabilities are deliberately headless (for example process
  // execution and realtime voice). They must still have contracts/adapters, but
  // they do not require a Doable UI reference to be considered covered.
  const uiCoverageGaps = CAPABILITY_BINDINGS
    .filter((binding) => binding.capability !== "processes" && binding.capability !== "voice-realtime")
    .filter((binding) => binding.uiReferencePaths.length === 0)
    .map((binding) => binding.capability);

  return {
    ok: missingAdapters.length === 0 && uiCoverageGaps.length === 0,
    missingAdapters,
    uiCoverageGaps,
    capabilities: CAPABILITY_BINDINGS.length,
    uiReferences: UI_REFERENCE_INVENTORY.length,
  };
}
