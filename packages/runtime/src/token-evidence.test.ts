import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startByolRuntime } from './server';
const source = "import * as Check from '@radix-ui/react-checkbox'; import { tokens as palette } from './values'; import './other-tokens'; export const Checkbox=(props:{checked?:boolean})=><Check.Root checked={props.checked} style={{width:palette.size.control,opacity:palette.opacity.disabled,height:palette.state.omit,marginTop:palette.state.empty}}/>;";
it.each([
  {value:'24',supported:true}, {value:'24 * 2',supported:false}, {value:'getWidth()',supported:false}, {value:'[24]',supported:false}, {value:'{value:24}',supported:false},
])('keeps typed alias token fidelity and blocks unsupported referenced values: $value', async ({value,supported}) => {
  const root=await mkdtemp(join(tmpdir(),'byol-token-evidence-')), repository=join(root,'source'),project=join(root,'project');await mkdir(repository);await mkdir(project);
  const git=(...args:string[])=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',repository,...args],{stdio:'ignore'});
  await writeFile(join(repository,'Checkbox.tsx'),source);
  await writeFile(join(repository,'values.ts'),`export const tokens={size:{control:${value}},opacity:{disabled:0.5},state:{omit:false,empty:null}};`);
  await writeFile(join(repository,'other-tokens.ts'),'export const tokens={size:{control:999},opacity:{disabled:1}};');
  git('init','-b','main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-m','token evidence');
  const runtime=await startByolRuntime({projectRoot:project});
  const post=async(action:string,body={})=>{const response=await fetch(runtime.url+'/api/'+action,{method:'POST',headers:{Authorization:'Bearer '+runtime.sessionToken,Origin:runtime.url,'Content-Type':'application/json'},body:JSON.stringify(body)});expect(response.status).toBe(200);return response.json() as Promise<any>;};
  try {
    const connected=await post('connect',{path:repository});const state=await post('drafts/create',{componentId:connected.components.find((component:any)=>component.name==='Checkbox').id}),item=state.drafts[0];
    if(supported){expect(item.manifest.tokens).toContainEqual({property:'width',category:'size',token:'palette.size.control'});expect(state.issues).toEqual([]);expect(item.ready).toBe(true);expect(item.tokenValues).toMatchObject({'palette.size.control':24,'palette.opacity.disabled':0.5,'palette.state.omit':false,'palette.state.empty':null});expect(item.preview.kind).toBe('checkbox');}
    else {expect(item.ready).toBe(false);expect(item.preview).toBeUndefined();expect(state.issues).toContainEqual(expect.objectContaining({id:`token-evidence:${item.draft.id}`,severity:'blocker'}));}
  }finally{await runtime.stop();await rm(root,{recursive:true,force:true});}
});
