import { createAliExpressAdapter } from './aliexpress';
import type { ProviderAdapter } from './types';

export { isRegisteredProvider, providerKeys } from './registry';

export function getProviderAdapter(
    providerKey: string,
    config: Record<string, string>,
    secrets: Record<string, string>,
    environment: string
  ): ProviderAdapter | null {
    switch (providerKey) {
      case 'aliexpress':
              return createAliExpressAdapter(config, secrets, environment as 'SANDBOX' | 'PRODUCTION');
      default:
              return null;
    }
}
