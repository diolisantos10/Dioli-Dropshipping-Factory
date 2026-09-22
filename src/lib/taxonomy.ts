export type TaxonomyNode={id:string;name:string;parentId:string|null;requiredAttributes:string[]};
export const baseTaxonomy:TaxonomyNode[]=[
 {id:'casa',name:'Casa',parentId:null,requiredAttributes:['material']},
 {id:'casa-decoracao',name:'Casa > Decoração',parentId:'casa',requiredAttributes:['material','cor','dimensões']},
 {id:'moda',name:'Moda',parentId:null,requiredAttributes:['material','cor','tamanho']},
 {id:'moda-acessorios',name:'Moda > Acessórios',parentId:'moda',requiredAttributes:['material','cor']},
 {id:'beleza',name:'Beleza',parentId:null,requiredAttributes:['composição','volume']},
 {id:'eletronicos',name:'Eletrônicos',parentId:null,requiredAttributes:['voltagem','garantia']},
 {id:'esporte',name:'Esporte',parentId:null,requiredAttributes:['material','peso']},
];
export function taxonomyGaps(category:string,attributes:Record<string,string>){const node=baseTaxonomy.find(item=>item.id===category||item.name===category);return node?node.requiredAttributes.filter(attribute=>!attributes[attribute]?.trim()):[]}
