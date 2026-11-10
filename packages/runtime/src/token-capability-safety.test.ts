import { expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractTokenValues } from './source-evidence';
import { startByolSession, requestByol } from '../../cli/src/index';
import type { RuntimeState } from './protocol';
const component=(key:string)=>`import * as Check from '@radix-ui/react-checkbox'; import {tokens as palette} from './values'; import './consumer'; export const Checkbox=(props:{checked?:boolean})=><Check.Root checked={props.checked} style={{width:palette.size.${key}}}/>;`;
async function inspect(key:string,definition:string,consumer:string,supported:boolean){
  const sources={'Checkbox.tsx':component(key),'values.ts':definition,'consumer.ts':consumer},token=`palette.size.${key}`;
  const values=extractTokenValues(sources,'Checkbox.tsx');
  if(supported)expect(values).toHaveProperty(token,24);else expect(Object.hasOwn(values,token)).toBe(false);
  const root=await mkdtemp(join(tmpdir(),'byol-capability-')),project=join(root,'project'),repository=join(root,'source');await mkdir(project);await mkdir(repository);
  for(const [path,text] of Object.entries(sources))await writeFile(join(repository,path),text);
  const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',repository,...args],{encoding:'utf8'}).trim();git('init','-b','main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-m','capability evidence');const before=git('show-ref');
  const session=await startByolSession({projectRoot:project});
  try{const connected=await requestByol<RuntimeState>(project,'connect',{path:repository}),state=await requestByol<RuntimeState>(project,'draft',{componentId:connected.components.find(c=>c.name==='Checkbox')!.id}),item=state.drafts[0];
    expect(item.ready).toBe(supported);
    if(supported){expect(state.issues).toEqual([]);expect(item.preview?.kind).toBe('checkbox');await expect(requestByol(project,'prepare',{draftId:item.draft.id})).resolves.toMatchObject({draftId:item.draft.id});}
    else{expect(item.preview).toBeUndefined();expect(state.issues).toContainEqual(expect.objectContaining({id:`token-evidence:${item.draft.id}`,severity:'blocker'}));await expect(requestByol(project,'prepare',{draftId:item.draft.id})).rejects.toThrow(/issue|ready/i);}
    expect(git('show-ref')).toBe(before);
  }finally{await session.stop();await rm(root,{recursive:true,force:true});}
}
it.each(['__proto__','constructor','prototype'])('rejects dangerous prototype path %s as canonical numeric evidence',async key=>{await inspect(key,`export const tokens={size:{${key}:24}};`,'export const ordinary=1;',false);});
it('rejects a prototype setter anywhere in the canonical graph even when the selected leaf is ordinary',async()=>{await inspect('control','export const tokens={__proto__:null,size:{control:24}};','export const ordinary=1;',false);});
it('rejects a dangerous prototype key in an unselected canonical branch',async()=>{await inspect('control','export const tokens={metadata:{__proto__:null},size:{control:24}};','export const ordinary=1;',false);});
it('rejects a prototype setter after an unsupported property in a nested canonical object',async()=>{await inspect('control',"export const tokens={metadata:{ignored(){},__proto__:null},size:{control:24}};",'export const ordinary=1;',false);});
const capabilities=[
  ['computed global Function',"const make=globalThis['Function']; make(\"return import('./values')\")().then(m=>m.tokens.size.control=999);"],
  ['global object alias',"const host=globalThis; const make=host['Function']; make(\"return import('./values')\")();"],
  ['direct Function alias',"const make=Function; make(\"return import('./values')\")();"],
  ['arrow constructor',"const make=(()=>{}).constructor; make(\"return import('./values')\")();"],
  ['function constructor',"const make=(function(){}).constructor; make(\"return import('./values')\")();"],
  ['element constructor',"const make=(()=>{})['constructor']; make(\"return import('./values')\")();"],
  ['computed constructor',"const key='constructor'; const make=(()=>{})[key]; make(\"return import('./values')\")();"],
  ['assembled constructor key',"const make=(()=>{})['con'+'structor']; make(\"return import('./values')\")();"],
  ['destructured constructor',"const {constructor:make}=(()=>{}); make(\"return import('./values')\")();"],
  ['eval alias',"const run=eval; run(\"import('./values')\");"],
  ['computed eval',"const run=globalThis['eval']; run(\"import('./values')\");"],
  ['window eval',"const run=window['eval']; run(\"import('./values')\");"],
  ['Reflect extraction',"const make=Reflect.get(()=>{},'constructor'); make(\"return import('./values')\")();"],
  ['descriptor extraction',"const proto=Object.getPrototypeOf(()=>{}); const make=Object.getOwnPropertyDescriptor(proto,'constructor').value; make(\"return import('./values')\")();"],
  ['computed require',"globalThis['require']('./values').tokens.size.control=999;"],
] as const;
it.each(capabilities)('rejects statically apparent dynamic execution capability: %s',async(_name,consumer)=>{await inspect('control','export const tokens={size:{control:24}};',`throw new Error('Source must never execute'); ${consumer}`,false);});
it.each(['control','constructorLabel','prototypeName','__proto__Label'])('retains safe ordinary token key %s and ordinary local code',async key=>{await inspect(key,`export const tokens={size:{${key}:24}};`,'const Function=(value:number)=>value; const list=[1,2]; export const ordinary=Function(list[0]);',true);});

const runtimeHeritage=[
  ['eval',"export class Derived extends (eval(\"import('./values').then(m=>m.tokens.size.control=999)\"), Object) {}"],
  ['computed Function',"export class Derived extends (globalThis['Function'](\"return import('./values')\")(), Object) {}"],
  ['arrow constructor',"export class Derived extends (((()=>{}).constructor)(\"return import('./values')\")(), Object) {}"],
  ['direct token mutation',"import {tokens} from './values'; export class Derived extends (tokens.size.control=999, Object) {}"],
] as const;
it.each(runtimeHeritage)('inspects runtime class heritage instead of erasing %s',async(_name,consumer)=>{await inspect('control','export const tokens={size:{control:24}};',consumer,false);});
const moduleCompilers=[
  ['external import equals',"import Module = require('node:module'); const compiler=new Module('mutator'); compiler._compile(\"import('./values').then(m=>m.tokens.size.control=999)\",'mutator.js');"],
  ['external loader alias',"import loader = require('node:module'); export const acquired=loader;"],
  ['module compiler member',"import {Module as Compiler} from 'custom-runtime'; new Compiler('mutator')._compile(\"import('./values')\",'mutator.js');"],
] as const;
it.each(moduleCompilers)('blocks module compiler acquisition: %s',async(_name,consumer)=>{await inspect('control','export const tokens={size:{control:24}};',consumer,false);});
const erasedAndStatic=[
  ['type-only module import equals',"import type Module = require('node:module'); export type Compiler=Module;"],
  ['type-only ESM capability import',"import type {Script} from 'node:vm'; export type Compiler=Script;"],
  ['interface and implements heritage',"interface Shape extends Function {} declare const shape:Shape; export class Safe implements Shape {}"],
  ['erased class type arguments and token queries',"import {tokens} from './values'; type Width=typeof tokens.size.control; class Base<T>{}; export class Safe extends Base<typeof globalThis.Function> {}"],
  ['static internal import alias',"namespace Ordinary {export const value=1;} import Alias=Ordinary; export const ordinary=Alias.value;"],
] as const;
it.each(erasedAndStatic)('preserves truly erased or static syntax: %s',async(_name,consumer)=>{await inspect('control','export const tokens={size:{control:24}};',consumer,true);});

it('inspects runtime generic instantiation instead of erasing its capability',async()=>{await inspect('control','export const tokens={size:{control:24}};',"const make=globalThis['Function']<any>; make(\"return import('./values')\")();",false);});
it('preserves a safe generic instantiation with erased token type arguments',async()=>{await inspect('control','export const tokens={size:{control:24}};',"import {tokens} from './values'; function identity<T>(value:T){return value;} const read=identity<typeof tokens.size.control>; export const ordinary=read(24);",true);});
