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
