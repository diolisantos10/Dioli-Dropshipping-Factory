import type { SupplierProduct } from './providers/types';
import type { IntakeState } from './intake';
import { addCandidate } from './intake';
import { supplierCandidateInput } from './supplier-product';
export { validateSupplierSearch } from './supplier-product';
export function importSupplierProduct(state:IntakeState,product:SupplierProduct,supplierName:string,id:string,at:string){return addCandidate(state,supplierCandidateInput(product,supplierName),id,at)}
