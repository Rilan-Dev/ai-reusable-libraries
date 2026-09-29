import type { ExecutionContext, StreamEvent } from "./core-types.js";

export interface PersistenceAdapter {
  query<T = unknown>(context: ExecutionContext, statement: string, parameters?: unknown[]): Promise<T[]>;
  transaction<T>(context: ExecutionContext, run: () => Promise<T>): Promise<T>;
  migrate?(context: ExecutionContext): Promise<void>;
}

export interface UsageQuotaAdapter {
  get(context: ExecutionContext): Promise<{ remaining?: number; limit?: number; used?: number }>;
  consume(context: ExecutionContext, units: number, metadata?: Record<string, unknown>): Promise<{ ok: boolean; remaining?: number }>;
  record?(context: ExecutionContext, usage: Record<string, unknown>): Promise<void>;
}

export interface AuditAdapter {
  append(context: ExecutionContext, event: Record<string, unknown>): Promise<void>;
  query?(context: ExecutionContext, filter?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

export interface AnalyticsAdapter {
  track(context: ExecutionContext, event: string, properties?: Record<string, unknown>): Promise<void>;
}

export interface BillingAdapter {
  getPlan(context: ExecutionContext): Promise<{ id: string; name?: string; metadata?: Record<string, unknown> }>;
  getSubscription?(context: ExecutionContext): Promise<{ id: string; status: string; planId?: string } | null>;
  createCheckout?(context: ExecutionContext, input: Record<string, unknown>): Promise<{ url?: string; id?: string }>;
  cancelSubscription?(context: ExecutionContext, subscriptionId: string): Promise<void>;
}

export interface NotificationAdapter {
  publish(context: ExecutionContext, notification: Record<string, unknown>): Promise<void>;
}

export interface EmailAdapter {
  send(context: ExecutionContext, message: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    templateId?: string;
    data?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; id?: string }>;
}

export interface VersionControlAdapter {
  list(context: ExecutionContext): Promise<Array<{ id: string; label?: string; createdAt?: string }>>;
  diff(context: ExecutionContext, fromId: string, toId: string): Promise<unknown>;
  restore(context: ExecutionContext, versionId: string): Promise<void>;
}

export interface DeploymentAdapter {
  deploy(context: ExecutionContext, input: Record<string, unknown>): Promise<{ id: string; url?: string; status?: string }>;
  status(context: ExecutionContext, deploymentId: string): Promise<{ status: string; url?: string }>;
}

export interface DomainAdapter {
  list(context: ExecutionContext): Promise<Array<{ domain: string; status?: string }>>;
  attach(context: ExecutionContext, domain: string, target: string): Promise<void>;
  detach(context: ExecutionContext, domain: string): Promise<void>;
}

export interface TemplateScaffoldAdapter {
  list(context: ExecutionContext): Promise<Array<{ id: string; name: string; metadata?: Record<string, unknown> }>>;
  instantiate(context: ExecutionContext, templateId: string, input?: Record<string, unknown>): Promise<void>;
}

export interface RealtimeCollaborationAdapter {
  join(context: ExecutionContext, roomId: string): Promise<{ roomId: string }>;
  leave(context: ExecutionContext, roomId: string): Promise<void>;
  publish(context: ExecutionContext, roomId: string, event: StreamEvent): Promise<void>;
}

export interface PlatformFoundationAdapters {
  persistence: PersistenceAdapter;
  usage: UsageQuotaAdapter;
  audit: AuditAdapter;
  analytics: AnalyticsAdapter;
  billing: BillingAdapter;
  notifications: NotificationAdapter;
  email: EmailAdapter;
  versions: VersionControlAdapter;
  deployment: DeploymentAdapter;
  domains: DomainAdapter;
  templates: TemplateScaffoldAdapter;
  collaboration: RealtimeCollaborationAdapter;
}