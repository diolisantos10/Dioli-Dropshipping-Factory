export const providerKeys = ['aliexpress', 'shopify'] as const;

export function isRegisteredProvider(providerKey: string): providerKey is typeof providerKeys[number] {
  return (providerKeys as readonly string[]).includes(providerKey);
}
