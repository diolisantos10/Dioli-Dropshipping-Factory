export interface ProviderAdapter {
  test(): Promise<{ ok: boolean; message: string }>;
}

export interface SupplierAdapter extends ProviderAdapter {
    searchProducts(query: string, options?: { page?: number; pageSize?: number; currency?: string }): Promise<SupplierProduct[]>;
    getProduct(itemId: string): Promise<SupplierProduct>;
}

export interface SupplierProduct {
    itemId: string;
    title: string;
    price: number;
    currency: string;
    imageUrl: string;
    detailUrl: string;
    stock?: number;
    shippingTime?: string;
}

export interface ChannelListingInput {
  externalId?: string | null;
  title: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  vendor: string;
  sku: string;
  price: number;
  currency: string;
  imageUrls: string[];
}

export interface ChannelListingResult { externalId: string; handle: string; status: string; adminUrl: string }

export interface ChannelOrder {
  externalOrderId: string;
  name: string;
  createdAt: string;
  currency: string;
  total: number;
  financialStatus: string;
  cancelled: boolean;
  lines: { externalProductId: string | null; sku: string; quantity: number; unitPrice: number }[];
}

export interface ChannelAdapter extends ProviderAdapter {
  upsertListing(input: ChannelListingInput): Promise<ChannelListingResult>;
  listRecentOrders(options?: { since?: string; limit?: number }): Promise<ChannelOrder[]>;
}
