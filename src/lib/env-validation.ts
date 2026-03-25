interface EnvVar {
  name: string;
  required: boolean;
  default?: string;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },
  { name: 'ENCRYPTION_SECRET', required: true, description: 'Secret for encrypting OAuth tokens and API keys (min 32 chars)' },
  { name: 'AI_PROVIDER', required: true, description: 'AI provider: openai, anthropic, or ollama' },
  { name: 'AI_API_KEY', required: false, description: 'API key for the AI provider (not needed for ollama)' },
  { name: 'AI_MODEL', required: false, default: 'gpt-4o', description: 'AI model name' },
  { name: 'EMBEDDING_PROVIDER', required: false, description: 'Embedding provider (defaults to AI_PROVIDER)' },
  { name: 'EMBEDDING_API_KEY', required: false, description: 'Embedding API key (defaults to AI_API_KEY)' },
  { name: 'EMBEDDING_MODEL', required: false, default: 'text-embedding-3-small', description: 'Embedding model name' },
  { name: 'DOCUMENT_STORAGE_PATH', required: false, default: './uploads/documents', description: 'Path for document storage' },
  { name: 'NEXTAUTH_URL', required: false, description: 'Base URL for the application' },
  { name: 'ANTHROPIC_API_KEY', required: false, description: 'Anthropic API key — enables cross-provider failover when AI_PROVIDER is openai' },
];

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    if (v.required && !value) {
      errors.push(`Missing required: ${v.name} — ${v.description}`);
    } else if (!v.required && !value && v.default) {
      warnings.push(`Using default for ${v.name}: ${v.default}`);
    }
  }

  // Specific validations
  const encSecret = process.env.ENCRYPTION_SECRET;
  if (encSecret && encSecret.length < 32) {
    errors.push('ENCRYPTION_SECRET must be at least 32 characters');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string (postgresql://...)');
  }

  return { valid: errors.length === 0, errors, warnings };
}
