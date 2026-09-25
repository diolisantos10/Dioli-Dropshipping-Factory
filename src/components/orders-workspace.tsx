'use client';
import { useState, useSyncExternalStore } from 'react';
import { emptyOrders, ORDER_STORAGE_KEY, type ExceptionResolution, type OrderState, type OrderStatus } from '@/lib/orders';
import { command, errorMessage, sendCommand, type Command } from '@/lib/command-client';
import { emptyProductFactory, PRODUCT_STORAGE_KEY, type ProductFactoryState } from '@/lib/product-factory';

const eventName='ddf-orders-change';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(eventName,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(eventName,callback)}}
function snapshot(){try{return `${localStorage.getItem(PRODUCT_STORAGE_KEY)??''}\n${localStorage.getItem(ORDER_STORAGE_KEY)??''}`}catch{return'unavailable'}}

export function OrdersWorkspace(){
 const raw=useSyncExternalStore(subscribe,snapshot,()=>null);const[productRaw,orderRaw]=(raw??'').split('\n');
 let products:ProductFactoryState=emptyProductFactory;let state:OrderState=emptyOrders;
 try{products=productRaw?JSON.parse(productRaw):emptyProductFactory;state=orderRaw?JSON.parse(orderRaw):emptyOrders}catch{}
 const[message,setMessage]=useState('');const[error,setError]=useState('');
 function act(cmd:Command,messageText:string){sendCommand(cmd).then(()=>{setMessage(messageText);setError('')},value=>setError(errorMessage(value,'Falha na operação.')))}
 return <div className="space-y-6">
  <header><p className="eyebrow">Operação / ciclo da venda</p><h1 className="display-title">Pedidos & Tracking</h1><p className="lede">Simulação rastreável do pedido externo ao envio, com snapshot econômico e fila de exceções.</p></header>
  <p className="surface p-4 text-sm">Fluxo sandbox: nenhum pedido é enviado a fornecedor ou canal real. A DDF aceita somente uma referência opaca do cliente e elimina esse vínculo após 90 dias.</p>
  {error&&<p role="alert" className="border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}<p role="status">{message}</p>
  <form className="surface grid gap-4 p-6" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);act(command('orders.receive',{externalOrderId:String(data.get('externalId')),productId:String(data.get('productId')),salePrice:Number(data.get('salePrice')),costSnapshot:Number(data.get('cost')),currency:'BRL',customerRef:String(data.get('customerRef'))}),'Pedido simulado recebido.')}}>
   <h2 className="text-xl font-semibold">Simular pedido recebido</h2>
   <label>ID externo<input required name="externalId" className="ddf-input"/></label>
   <label>Referência opaca do cliente <span className="text-xs text-slate-500">(opcional; nunca use nome, e-mail, telefone ou documento)</span><input name="customerRef" maxLength={100} className="ddf-input" placeholder="customer_8f4b"/></label>
   <label>Produto<select required name="productId" className="ddf-input"><option value="">Selecione</option>{products.products.filter(item=>item.status==='PRONTO').map(item=><option value={item.id} key={item.id}>{item.universalTitle}</option>)}</select></label>
   <div className="grid gap-4 sm:grid-cols-2"><label>Preço da venda<input required type="number" min="0.01" step="0.01" name="salePrice" className="ddf-input"/></label><label>Custo no momento da venda<input required type="number" min="0" step="0.01" name="cost" className="ddf-input"/></label></div>
   <button className="ddf-button">Receber pedido simulado</button>
  </form>
  {state.orders.length>0&&<button className="ddf-button secondary" onClick={()=>act(command('orders.purgeExpired'),'Política de retenção aplicada.')}>Aplicar retenção agora</button>}
  <section className="space-y-3">{state.orders.length===0&&<p className="surface p-8">Nenhum pedido.</p>}{state.orders.map(order=>{
   const next:Partial<Record<OrderStatus,OrderStatus>>={RECEBIDO:'VALIDADO',VALIDADO:'EM_FULFILLMENT'};
   return <article className="surface space-y-3 p-5" key={order.id}>
    <div className="flex justify-between"><h2 className="font-semibold">{order.externalOrderId}</h2><span>{order.status}</span></div>
    <p>{products.products.find(product=>product.id===order.productId)?.universalTitle??order.productId}</p>
    <p>Venda R$ {order.salePrice.toFixed(2)} · custo snapshot R$ {order.costSnapshot.toFixed(2)}</p>
    <p className="text-sm text-slate-600">Retenção do vínculo: {new Date(order.retentionUntil||order.createdAt).toLocaleDateString('pt-BR')}</p>
    {order.exceptionReason&&<p role="alert" className="border border-red-200 bg-red-50 p-3 text-red-800">Exceção ({order.exceptionCategory??'OUTRO'}): {order.exceptionReason}</p>}
    {next[order.status]&&<button className="ddf-button" onClick={()=>act(command('orders.advance',{orderId:order.id,status:next[order.status]!}),'Pedido avançado.')}>Avançar para {next[order.status]}</button>}
    {order.status==='EM_FULFILLMENT'&&<form className="flex gap-3" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);act(command('orders.advance',{orderId:order.id,status:'ENVIADO',tracking:String(data.get('tracking'))}),'Tracking registrado.')}}><input required name="tracking" className="ddf-input" placeholder="Código de tracking"/><button className="ddf-button">Marcar enviado</button></form>}
    {!['ENVIADO','EXCECAO','CANCELADO','RECUSADO'].includes(order.status)&&<form className="grid gap-2 sm:grid-cols-[180px_1fr_auto]" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);act(command('orders.flagException',{orderId:order.id,reason:String(data.get('reason')),category:String(data.get('category'))}),'Pedido enviado para a fila de exceções.')}}><label className="sr-only" htmlFor={`category-${order.id}`}>Categoria</label><select id={`category-${order.id}`} name="category" className="ddf-input">{['PAGAMENTO','ESTOQUE','ENDERECO','FORNECEDOR','FRAUDE','INTEGRACAO','OUTRO'].map(category=><option key={category}>{category}</option>)}</select><label className="sr-only" htmlFor={`reason-${order.id}`}>Motivo</label><input id={`reason-${order.id}`} required name="reason" className="ddf-input" placeholder="Motivo da exceção"/><button className="ddf-button secondary">Registrar exceção</button></form>}
    {order.status==='EXCECAO'&&<form className="grid gap-2 sm:grid-cols-[180px_1fr_auto]" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);const resolution=String(data.get('resolution')) as ExceptionResolution;act(command('orders.resolveException',{orderId:order.id,resolution,note:String(data.get('note'))}),resolution==='RECUPERAR'?'Exceção resolvida; pedido restaurado.':'Pedido encerrado de forma controlada.')}}><label className="sr-only" htmlFor={`resolution-${order.id}`}>Resolução</label><select id={`resolution-${order.id}`} name="resolution" className="ddf-input"><option value="RECUPERAR">Recuperar</option><option value="CANCELAR">Cancelar</option><option value="RECUSAR">Recusar</option></select><label className="sr-only" htmlFor={`note-${order.id}`}>Nota da resolução</label><input id={`note-${order.id}`} name="note" className="ddf-input" placeholder="Nota da resolução"/><button className="ddf-button">Concluir tratamento</button></form>}
   </article>})}</section>
 </div>
}
