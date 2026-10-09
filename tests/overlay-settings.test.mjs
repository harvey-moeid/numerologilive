import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTEXT_LABELS, DEFAULT_SETTINGS, normalizeSettings, formatReading } from "../overlay-settings.mjs";
import { onRequest as adminRoute } from "../functions/api/admin/settings.js";
import { onRequestGet as publicRoute } from "../functions/api/overlay-config.js";
const TOKEN="admin-very-private-token-abcdefghijklmnopqrstuvwxyz";
const makeBucket=()=>{
  let stored=null;
  return {
    async get(){return stored?{json:async()=>stored}:null;},
    async put(_key,text){stored=JSON.parse(text);}
  };
};
const env=()=>({NUMEROLOGY_ADMIN_TOKEN:TOKEN,NUMEROLOGY_CONFIG_R2:makeBucket()});
const req=(method="GET",body=null,token=TOKEN)=>new Request("https://numerology.example/api/admin/settings",{
  method,headers:{"Authorization":"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
test("settings normalize unknown context and bound numeric/string inputs",()=>{
  const value=normalizeSettings({contexts:["love","career","fake","love"],likeThreshold:9999999,
    siteName:" A ".repeat(200),giftsEnabled:false,likesEnabled:false});
  assert.deepEqual(value.contexts,["love","career"]);
  assert.equal(value.likeThreshold,400);
  assert.equal(value.giftsEnabled,true);
  assert.ok(value.siteName.length<=50);
  assert.equal(Object.keys(CONTEXT_LABELS).length,6);
  assert.equal(normalizeSettings({}).dobMode,"flexible");
  assert.equal(normalizeSettings({dobMode:"fake"}).dobMode,"flexible");
  assert.equal(normalizeSettings({dobNoticeCooldownSeconds:900}).dobNoticeCooldownSeconds,45);
});
test("selected contexts are rendered from actual numerology interpretations",()=>{
  const item={summary:"Umum",relationships:"Cinta",career:"Karier",strengths:["Teguh"],challenges:["Ragu"],advice:["Coba lagi"]};
  assert.equal(formatReading(item,["love"]),"Cinta");
  assert.match(formatReading(item,["career","advice"]),/Karier & pekerjaan: Karier\n\nSaran refleksi: Coba lagi/);
  assert.equal(formatReading(item,["general"]),"Umum");
});
test("admin accepts 2-character tokens and rejects invalid or unconfigured secrets",async()=>{
  const ok=env();
  assert.equal((await adminRoute({request:req("GET",null,"wrong-token"),env:ok})).status,401);
  assert.equal((await adminRoute({request:req(),env:{NUMEROLOGY_CONFIG_R2:makeBucket()}})).status,503);
  assert.equal((await adminRoute({request:req(),env:{NUMEROLOGY_ADMIN_TOKEN:TOKEN}})).status,503);
  const shortEnv={NUMEROLOGY_ADMIN_TOKEN:"A9",NUMEROLOGY_CONFIG_R2:makeBucket()};
  assert.equal((await adminRoute({request:req("GET",null,"A9"),env:shortEnv})).status,200);
  assert.equal((await adminRoute({request:req("GET",null,"A0"),env:shortEnv})).status,401);
  assert.equal((await adminRoute({request:req("GET",null,"A9"),env:{...shortEnv,NUMEROLOGY_ADMIN_TOKEN:"A"}})).status,503);
  assert.equal((await adminRoute({request:req("GET",null,"A9"),env:{...shortEnv,NUMEROLOGY_ADMIN_TOKEN:"Z".repeat(513)}})).status,503);
});
test("R2 JSON save loads into public overlay endpoint and no secret leaks",async()=>{
  const e=env();
  const initial=await (await adminRoute({request:req(),env:e})).json();
  assert.deepEqual(initial.settings.contexts,DEFAULT_SETTINGS.contexts);
  const desired={...DEFAULT_SETTINGS,siteName:"JALUR LIVE",contexts:["love","career"],giftMinimum:5,likeThreshold:600,
    dobMode:"strict",dobAutoCorrect:false,dobErrorNotices:false,dobNoticeCooldownSeconds:60,
    dobHelpText:"Tulis DD/MM/YYYY"};
  const saved=await adminRoute({request:req("PUT",desired),env:e});
  assert.equal(saved.status,200);
  const pub=await publicRoute({env:e});
  assert.equal(pub.status,200);
  const raw=await pub.text();
  assert.equal(raw.includes(TOKEN),false);
  assert.equal(JSON.parse(raw).settings.giftMinimum,5);
  assert.equal(JSON.parse(raw).settings.dobMode,"strict");
  assert.equal(JSON.parse(raw).settings.dobAutoCorrect,false);
  assert.equal(JSON.parse(raw).settings.dobErrorNotices,false);
  assert.equal(JSON.parse(raw).settings.dobHelpText,"Tulis DD/MM/YYYY");
  assert.deepEqual((await (await adminRoute({request:req(),env:e})).json()).settings.contexts,["love","career"]);
});
test("admin rejects missing contexts, disabled triggers, invalid JSON, wrong origin",async()=>{
  const e=env();
  assert.equal((await adminRoute({request:req("PUT",{...DEFAULT_SETTINGS,contexts:[]}),env:e})).status,400);
  assert.equal((await adminRoute({request:req("PUT",{...DEFAULT_SETTINGS,likesEnabled:false,giftsEnabled:false}),env:e})).status,400);
  for (const invalid of [
    {...DEFAULT_SETTINGS,dobMode:"unknown"},
    {...DEFAULT_SETTINGS,dobAutoCorrect:"yes"},
    {...DEFAULT_SETTINGS,dobNoticeCooldownSeconds:0},
    {...DEFAULT_SETTINGS,dobHelpText:"X".repeat(121)}
  ]) assert.equal((await adminRoute({request:req("PUT",invalid),env:e})).status,400);
  const wrongOrigin=new Request("https://numerology.example/api/admin/settings",{
    method:"PUT",headers:{Authorization:"Bearer "+TOKEN,"Origin":"https://attacker.example","Content-Type":"application/json"},
    body:JSON.stringify(DEFAULT_SETTINGS)
  });
  assert.equal((await adminRoute({request:wrongOrigin,env:e})).status,403);
  const invalid=new Request("https://numerology.example/api/admin/settings",{
    method:"PUT",headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},body:"{bad"
  });
  assert.equal((await adminRoute({request:invalid,env:e})).status,400);
});
test("admin UI and overlay bind to config endpoints, no admin token in public JS",()=>{
  const html=readFileSync(new URL("../admin.html",import.meta.url),"utf8");
  const client=readFileSync(new URL("../admin.mjs",import.meta.url),"utf8");
  const overlay=readFileSync(new URL("../live-overlay.mjs",import.meta.url),"utf8");
  assert.match(html,/id="adminToken"[^>]*minlength="2"[^>]*maxlength="512"/);
  assert.match(html,/id="contextChoices"/);
  for (const id of ["dobMode","dobAutoCorrect","dobErrorNotices","dobHelpText","dobTestInput","dobTestButton"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(client,/parseDob/);
  assert.match(html,/id="save"/);
  assert.match(client,/\/api\/admin\/settings/);
  assert.match(overlay,/\/api\/overlay-config/);
  assert.doesNotMatch(overlay,/NUMEROLOGY_ADMIN_TOKEN/);
});
