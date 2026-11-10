import { expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractTokenValues, deriveCheckboxPreview } from './source-evidence';
import { startByolSession, requestByol } from '../../cli/src/index';
import type { RuntimeState } from './protocol';
const component="import * as Check from '@radix-ui/react-checkbox'; import { tokens as palette } from './values'; export const Checkbox=(props:{checked?:boolean})=><Check.Root checked={props.checked} style={{width:palette.size.control}}/>;";
const definition='export const tokens={size:{control:24}};';
const cases: {name:string;source?:string;definition?:string;extra?:Record<string,string>}[]=[
  {name:'parameter shadowing',source:component.replace('(props:{checked?:boolean})','(palette:{checked?:boolean})').replace('checked={props.checked}','checked={palette.checked}')},
  {name:'consumer assignment',source:component+' palette.size.control=999;'},
  {name:'consumer update',source:component+' palette.size.control++;'},
  {name:'consumer delete',source:component+' delete palette.size.control;'},
  {name:'Object.assign mutation',source:component+' Object.assign(palette.size,{control:999});'},
  {name:'object alias mutation',source:component+' const alias=palette.size; alias.control=999;'},
  {name:'sibling declarator assignment',definition:'export const tokens={size:{control:24}}, changed=(tokens.size.control=999);'},
  {name:'sibling declarator alias mutation',definition:'export const tokens={size:{control:24}}, alias=tokens.size; alias.control=999;'},
  {name:'namespace element alias mutation',source:component+" import './mutator';",extra:{'mutator.ts':"import * as system from './values'; const alias=system['tokens']; alias.size.control=999;"}},
  {name:'namespace computed alias mutation',source:component+" import './mutator';",extra:{'mutator.ts':"import * as system from './values'; const key='tokens', alias=system[key]; alias.size.control=999;"}},
  {name:'namespace consumer mutation',source:component+" import './mutator';",extra:{'mutator.ts':"import * as system from './values'; system.tokens.size.control=999;"}},
  {name:'require alias mutation',source:component+" const alias=require('./values'); alias.tokens.size.control=999;"},
  {name:'dynamic import alias mutation',source:component+" import('./values').then(module=>{module.tokens.size.control=999;});"},
  {name:'dynamic evaluation mutation',source:component+" eval('palette.size.control=999');"},
  {name:'dependency consumer mutation',source:component+" import './mutator';",extra:{'mutator.ts':"import {tokens as system} from './values'; system.size.control=999;"}},
];
it.each(cases)('blocks lexical or mutable token evidence before preview/integration: $name',async scenario=>{
  const source=scenario.source??component, values=scenario.definition??definition, sources={'Checkbox.tsx':source,'values.ts':values,...(scenario.extra??{})};
  expect(extractTokenValues(sources,'Checkbox.tsx')).not.toHaveProperty('palette.size.control');
  const root=await mkdtemp(join(tmpdir(),'byol-binding-')),project=join(root,'project'),repository=join(root,'source');await mkdir(project);await mkdir(repository);
  for(const [path,text] of Object.entries(sources)) await writeFile(join(repository,path),text);
  const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',repository,...args],{encoding:'utf8'}).trim();
  git('init','-b','main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-m','binding evidence'); const before=git('show-ref');
  const session=await startByolSession({projectRoot:project});
  const call=(command:string,body={})=>requestByol<RuntimeState>(project,command,body);
  try{const connected=await call('connect',{path:repository}),state=await call('draft',{componentId:connected.components.find(c=>c.name==='Checkbox')!.id}),item=state.drafts[0];expect(item.ready).toBe(false);expect(item.preview).toBeUndefined();expect(state.issues).toContainEqual(expect.objectContaining({id:`${scenario.name==='parameter shadowing'?'preview':'token-evidence'}:${item.draft.id}`,severity:'blocker'}));await expect(call('prepare',{draftId:item.draft.id})).rejects.toThrow(/issue|ready/i);expect(git('show-ref')).toBe(before);}finally{await session.stop();await rm(root,{recursive:true,force:true});}
});
it('retains an immutable named reexport alias in a neutral module graph and ignores unrelated binding mutations',()=>{
  const sources={'Checkbox.tsx':component+" import './other'; function helper(palette:any){palette.size.control=999;}",'values.ts':"export {scale as tokens} from './scale';",'scale.ts':'const literal={size:{control:24}} as const; export {literal as scale};','other.ts':'export const tokens={size:{control:5}}; tokens.size.control=999;'};
  expect(extractTokenValues(sources,'Checkbox.tsx')).toMatchObject({'palette.size.control':24});
});
it('does not bind a local shadowing declaration to the identically named import',()=>{
  const source=component.replace('export const Checkbox=', 'function helper(){const palette={size:{control:999}};return <div style={{width:palette.size.control}}/>;} export const Checkbox=');
  expect(extractTokenValues({'Checkbox.tsx':source,'values.ts':definition},'Checkbox.tsx')).not.toHaveProperty('palette.size.control');
});
it('keeps an immutable named reexport alias ready through repository discovery and integration preparation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'byol-immutable-')),project=join(root,'project'),repository=join(root,'source');await mkdir(project);await mkdir(repository);
  const sources={'Checkbox.tsx':component,'values.ts':"export {scale as tokens} from './scale';",'scale.ts':'const literal={size:{control:24}} as const; export {literal as scale};'};
  for(const [path,text] of Object.entries(sources))await writeFile(join(repository,path),text);
  const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',repository,...args],{encoding:'utf8'}).trim();git('init','-b','main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-m','immutable alias');const before=git('show-ref');
  const session=await startByolSession({projectRoot:project});
  try{const connected=await requestByol<RuntimeState>(project,'connect',{path:repository}),state=await requestByol<RuntimeState>(project,'draft',{componentId:connected.components.find(c=>c.name==='Checkbox')!.id}),item=state.drafts[0];expect(item.ready).toBe(true);expect(state.issues).toEqual([]);expect(item.tokenValues).toMatchObject({'palette.size.control':24});expect(item.preview?.kind).toBe('checkbox');await expect(requestByol(project,'prepare',{draftId:item.draft.id})).resolves.toMatchObject({draftId:item.draft.id});expect(git('show-ref')).toBe(before);}finally{await session.stop();await rm(root,{recursive:true,force:true});}
});

it('declines the reconstruction shape when a parameter shadows the imported token binding',()=>{
  expect(deriveCheckboxPreview(cases.find(entry=>entry.name==='parameter shadowing')!.source!,'Checkbox.tsx',[])).toBeUndefined();
});
it('declines a Root namespace shadow rather than inventing Radix behavior',()=>{
  const source=component.replace('(props:{checked?:boolean})','(Check:{checked?:boolean})').replace('checked={props.checked}','checked={Check.checked}');
  expect(deriveCheckboxPreview(source,'Checkbox.tsx',[])).toBeUndefined();
});
