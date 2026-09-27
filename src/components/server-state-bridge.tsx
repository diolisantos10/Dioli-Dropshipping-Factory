'use client';
import { useEffect, useState } from 'react';
// Read-only mirror: the server is the source of truth and every mutation goes through /api/commands.
const stores = [
  ['intake','ddf.intake.demo.v1','ddf-intake-change'],['products','ddf.products.demo.v1','ddf-products-change'],
  ['media','ddf.media.demo.v1','ddf-media-change'],['pricing','ddf.pricing.demo.v1','ddf-pricing-change'],
  ['connectors','ddf.connectors.demo.v1','ddf-connectors-change'],['orders','ddf.orders.demo.v1','ddf-orders-change'],
  ['catalog','ddf.catalog.demo.v1','ddf-catalog-change'],
] as const;
export function ServerStateBridge(){const[state,setState]=useState<'loading'|'online'|'offline'>('loading');useEffect(()=>{let active=true;
  const pull=()=>Promise.all(stores.map(async([namespace,key,event])=>{const response=await fetch(`/api/state/${namespace}`,{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json();const next=data.payload?JSON.stringify(data.payload):null;try{if(next===null)localStorage.removeItem(key);else if(localStorage.getItem(key)!==next)localStorage.setItem(key,next);else return}catch{/* cache full or blocked: the server stays the source of truth */}window.dispatchEvent(new Event(event));})).then(()=>active&&setState('online')).catch(()=>active&&setState('offline'));
  void pull();const onFocus=()=>{if(document.visibilityState==='visible')void pull()};document.addEventListener('visibilitychange',onFocus);return()=>{active=false;document.removeEventListener('visibilitychange',onFocus)}},[]);
 return <div className={`fixed bottom-3 right-3 z-50 rounded px-3 py-2 text-xs font-semibold shadow ${state==='online'?'bg-green-100 text-green-900':state==='loading'?'bg-stone-200 text-stone-700':'bg-red-100 text-red-900'}`} role="status">{state==='online'?'Banco sincronizado':state==='loading'?'Conectando ao banco…':'Banco indisponível — somente leitura'}</div>}
