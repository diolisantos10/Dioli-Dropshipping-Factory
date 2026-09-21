'use client';
import { useState, useSyncExternalStore } from 'react';
import { advanceOrder, emptyOrders, flagOrderException, ORDER_STORAGE_KEY, receiveOrder, resolveOrderException, type OrderState, type OrderStatus } from '@/lib/orders';
import { emptyProductFactory, PRODUCT_STORAGE_KEY, type ProductFactoryState } from '@/lib/product-factory';

const eventName='ddf-orders-change';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(eventName,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(eventName,callback)}}
function snapshot(){try{return `${localStorage.getItem(PRODUCT_STORAGE_KEY)??''}\n${localStorage.getItem(ORDER_STORAGE_KEY)??''}`}catch{return'unavailable'}}

export function OrdersWorkspace(){
 const raw=useSyncExternalStore(subscribe,snapshot,()=>null);const[productRaw,orderRaw]=(raw??'').split('\n');
 let products:ProductFactoryState=emptyProductFactory;let state:OrderState=emptyOrders;
 try{products=productRaw?JSON.parse(productRaw):emptyProductFactory;state=orderRaw?JSON.parse(orderRaw):emptyOrders}catch{}
 const[message,setMessage]=useState('');const[error,setError]=useState('');
 function save(next:OrderState,messageText:string){if(snapshot()!==raw)throw new Error('Os dados mudaram em outra aba. Recarregue antes de repetir.');localStorage.setItem(ORDER_STORAGE_KEY,JSON.stringify(next));window.dispatchEvent(new Event(eventName));setMessage(messageText);setError('')}
 function act(action:()=>OrderState,messageText:string){try{save(action(),messageText)}catch(value){setError(value instanceof Error?value.message:'Falha na operação.')}}
 return <div className="space-y-6">
  <header><p className="eyebrow">Operação / ciclo da venda</p><h1 className="display-title">Pedidos & Tracking</h1><p className="lede">Simulação rastreável do pedido externo ao envio, com snapshot econômico e fila de exceções.</p></header>
  <p className="surface p-4 text-sm">Fluxo controlado: nenhum pedido é enviado a fornecedor ou canal real.</p>
  {error&&<p role="alert" className="border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}<p role="status">{message}</p>
  <form className="surface grid gap-4 p-6" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);act(()=>receiveOrder(state,{externalOrderId:String(data.get('externalId')),productId:String(data.get('productId')),salePrice:Number(data.get('salePrice')),costSnapshot:Number(data.get('cost')),currency:'BRL'},crypto.randomUUID(),new Date().toISOString()),'Pedido simulado recebido.')}}>
   <h2 className="text-xl font-semibold">Simular pedido recebido</h2>
   <label>ID externo<input required name="externalId" className="ddf-input"/></label>
   <label>Produto<select required name="productId" className="ddf-input"><option value="">Selecione</option>{products.products.filter(item=>item.status==='PRONTO').map(item=><option value={item.id} key={item.id}>{item.universalTitle}</option>)}</select></label>
   <div className="grid gap-4 sm:grid-cols-2"><label>Preço da venda<input required type="number" min="0.01" step="0.01" name="salePrice" className="ddf-input"/></label><label>Custo no momento da venda<input required type="number" min="0" step="0.01" name="cost" className="ddf-input"/></label></div>
   <button className="ddf-button">Receber pedido simulado</button>
  </form>
  <section className="space-y-3">{state.orders.length===0&&<p className="surface p-8">Nenhum pedido.</p>}{state.orders.map(order=>{
   const next:Partial<Record<OrderStatus,OrderStatus>>={RECEBIDO:'VALIDADO',VALIDADO:'EM_FULFILLMENT'};
   return <article className="surface space-y-3 p-5" key={order.id}>
    <div className="flex justify-between"><h2 className="font-semibold">{order.externalOrderId}</h2><span>{order.status}</span></div>
    <p>{products.products.find(product=>product.id===order.productId)?.universalTitle??order.productId}</p>
    <p>Venda R$ {order.salePrice.toFixed(2)} · custo snapshot R$ {order.costSnapshot.toFixed(2)}</p>
    {order.exceptionReason&&<p className="border border-red-200 bg-red-50 p-3 text-red-800">Exceção: {order.exceptionReason}</p>}
    {next[order.status]&&<button className="ddf-button" onClick={()=>act(()=>advanceOrder(state,order.id,next[order.status]!,new Date().toISOString()),'Pedido avançado.')}>Avançar para {next[order.status]}</button>}
    {order.status==='EM_FULFILLMENT'&&<form className="flex gap-3" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);act(()=>advanceOrder(state,order.id,'ENVIADO',new Date().toISOString(),String(data.get('tracking'))),'Tracking registrado.')}}><input required name="tracking" className="ddf-input" placeholder="Código de tracking"/><button className="ddf-button">Marcar enviado</button></form>}
    {!['ENVIADO','EXCECAO'].includes(order.status)&&<button className="ddf-button secondary" onClick={()=>{const reason=window.prompt('Motivo da exceção');if(reason)act(()=>flagOrderException(state,order.id,reason,new Date().toISOString()),'Pedido enviado para a fila de exceções.')}}>Registrar exceção</button>}
    {order.status==='EXCECAO'&&<button className="ddf-button" onClick={()=>act(()=>resolveOrderException(state,order.id,new Date().toISOString()),'Exceção resolvida; pedido restaurado.')}>Resolver exceção</button>}
   </article>})}</section>
 </div>
}
