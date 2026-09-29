import type {
  AgentRuntimeAdapter,
  AgentRuntimeRequest,
  ChatTransportAdapter,
  ContextMemoryAdapter,
  ExecutionContext,
  FileEntry,
  FileWorkspaceAdapter,
  IntegrationAdapter,
  IntegrationConnection,
  IntegrationDescriptor,
  MCPAdapter,
  MCPServer,
  ModelRef,
  ProcessExecutionAdapter,
  ProviderConnection,
  ProviderDescriptor,
  ProviderRegistryAdapter,
  ProviderResolverAdapter,
  RAGAdapter,
  RetrievedDocument,
  SandboxAdapter,
  SecretCredentialAdapter,
  StreamEvent,
  ToolDefinition,
  ToolRegistryAdapter,
  ToolResult,
  VoiceRealtimeAdapter,
} from "../contracts/index.js";

export interface DoableRuntimeBindings {
  agent: {
    run(request: AgentRuntimeRequest): AsyncIterable<StreamEvent>;
  };
  providers: {
    list(context: ExecutionContext): Promise<ProviderDescriptor[]>;
    getConnection(context: ExecutionContext, providerId: string): Promise<ProviderConnection | null>;
    testConnection(context: ExecutionContext, providerId: string): Promise<{ ok: boolean; message?: string }>;
    resolve(context: ExecutionContext, requested?: ModelRef): Promise<ModelRef>;
  };
  tools: {
    list(context: ExecutionContext): Promise<ToolDefinition[]>;
    invoke(context: ExecutionContext, toolName: string, input: unknown): Promise<ToolResult>;
  };
  mcp: {
    listServers(context: ExecutionContext): Promise<MCPServer[]>;
    listTools(context: ExecutionContext, serverId: string): Promise<ToolDefinition[]>;
    callTool(context: ExecutionContext, serverId: string, toolName: string, input: unknown): Promise<ToolResult>;
  };
  integrations: {
    list(context: ExecutionContext): Promise<IntegrationDescriptor[]>;
    getConnection(context: ExecutionContext, integrationId: string): Promise<IntegrationConnection | null>;
    connect(context: ExecutionContext, integrationId: string, configuration: Record<string, unknown>): Promise<IntegrationConnection>;
    disconnect(context: ExecutionContext, integrationId: string): Promise<void>;
    listTools(context: ExecutionContext, integrationId: string): Promise<ToolDefinition[]>;
    invoke(context: ExecutionContext, integrationId: string, action: string, input: unknown): Promise<ToolResult>;
  };
  context: ContextMemoryAdapter;
  rag: RAGAdapter;
  workspace: FileWorkspaceAdapter;
  processes: ProcessExecutionAdapter;
  sandbox: SandboxAdapter;
  transport: ChatTransportAdapter;
  voice: VoiceRealtimeAdapter;
  secrets: SecretCredentialAdapter;
  identity: {
    resolve(request: unknown): Promise<Pick<ExecutionContext, "tenantId" | "userId">>;
  };
}

export function createDoableRuntimeAdapters(bindings: DoableRuntimeBindings): {
  identity: DoableRuntimeBindings["identity"];
  providers: ProviderRegistryAdapter & { resolver: ProviderResolverAdapter };
  agents: AgentRuntimeAdapter;
  tools: ToolRegistryAdapter;
  mcp: MCPAdapter;
  integrations: IntegrationAdapter;
  workspace: FileWorkspaceAdapter;
  processes: ProcessExecutionAdapter;
  sandbox: SandboxAdapter;
  context: ContextMemoryAdapter;
  rag: RAGAdapter;
  transport: ChatTransportAdapter;
  voice: VoiceRealtimeAdapter;
  secrets: SecretCredentialAdapter;
} {
  return {
    identity: bindings.identity,
    providers: {
      list: bindings.providers.list,
      getConnection: bindings.providers.getConnection,
      testConnection: bindings.providers.testConnection,
      resolver: { resolve: bindings.providers.resolve },
    },
    agents: { run: bindings.agent.run },
    tools: { list: bindings.tools.list, invoke: bindings.tools.invoke },
    mcp: {
      listServers: bindings.mcp.listServers,
      listTools: bindings.mcp.listTools,
      callTool: bindings.mcp.callTool,
    },
    integrations: {
      list: bindings.integrations.list,
      getConnection: bindings.integrations.getConnection,
      connect: bindings.integrations.connect,
      disconnect: bindings.integrations.disconnect,
      listTools: bindings.integrations.listTools,
      invoke: bindings.integrations.invoke,
    },
    workspace: bindings.workspace,
    processes: bindings.processes,
    sandbox: bindings.sandbox,
    context: bindings.context,
    rag: bindings.rag,
    transport: bindings.transport,
    voice: bindings.voice,
    secrets: bindings.secrets,
  };
}
