import type { ExecutionContext } from "./core-types.js";

export type SecuritySeverity = "critical" | "high" | "medium" | "low";
export type SecurityFindingCategory = "dependency" | "secret" | "code-quality";

export interface SecurityFinding {
  severity: SecuritySeverity;
  category: SecurityFindingCategory;
  title: string;
  description?: string;
  filePath?: string;
  lineNumber?: number;
  codeSnippet?: string;
  fixSuggestion?: string;
}

export interface SecurityScanResult {
  findings: SecurityFinding[];
  filesScanned: number;
  duration: number;
}

export interface SecurityScannerAdapter {
  scan(
    context: ExecutionContext,
    options?: {
      scanDependencies?: boolean;
      scanSecrets?: boolean;
      scanCodeQuality?: boolean;
    },
  ): Promise<SecurityScanResult>;
}
