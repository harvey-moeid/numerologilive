import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"), css=read("styles.css"),js=read("app.js");
const admin=read("admin.html"), adminCss=read("admin.css");
const favicon=read("assets/icons/favicon.svg");

test("main experience retains every element used by calculator and LIVE status",()=>{
  const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(allIds).size,allIds.length,"DOM ids must be unique");
  const scriptIds=[...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(match=>match[1]);
  const fromLive=["liveNow","liveAccount"];
  for(const id of [...scriptIds,...fromLive])
    assert.ok(allIds.includes(id),"missing DOM id: "+id);
  for(const id of ["calcForm","dob","calcBtn","dobErr","pyramidGrid","pyramidDetail",
     "lifeNum","lifeTitle","lifeSummary","mJiwa","mHati","mKarisma","mTantangan",
     "lifeStrengths","lifeChallenges","lifeAdvice","lifeRelationships","lifeCareer",
     "shareBtn","resetBtn","backBtn","toast","result","landing"])
    assert.ok(allIds.includes(id),"missing calculator id: "+id);
});

test("calculator submits without reloading and keeps date boundary local",()=>{
  assert.match(html,/<form id="calcForm"[^>]*novalidate/);
  assert.match(html,/<button type="submit"[^>]*id="calcBtn" disabled>/);
  assert.match(js,/getElementById\('calcForm'\)\.addEventListener\('submit',event=>\{event\.preventDefault\(\);runCalculation\(\)\}\)/);
  assert.doesNotMatch(js,/calcBtn\.addEventListener\('click',runCalculation\)/);
  assert.match(js,/getMonth\(\)\+1/);
  assert.doesNotMatch(js,/toISOString\(\)\.slice\(0,10\)/);
  assert.match(html,/<section id="result" class="hidden" tabindex="-1"/);
  assert.match(js,/result\.focus\(\{preventScroll:true\}\)/);
});

test("design is fully responsive and respects reduced-motion preferences",()=>{
  assert.match(html,/<html lang="id">/);
  assert.match(html,/href="#main">Lewati navigasi/);
  assert.match(html,/<meta name="viewport"/);
  assert.match(css,/@media \(max-width:800px\)/);
  assert.match(css,/@media \(max-width:520px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/:focus-visible/);
  assert.match(html,/href="\/assets\/icons\/favicon\.svg"/);
  assert.match(favicon,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("admin provides anchored settings and keeps authenticated controls",()=>{
  for(const id of ["authForm","adminToken","panel","settingsForm","webhookUrl",
    "copyWebhookUrl","save","reset","logout","sectionReading","sectionTrigger",
    "sectionParser","sectionCopy","sectionElements"])
    assert.match(admin,new RegExp('id="'+id+'"'),"missing admin element: "+id);
  assert.match(admin,/class="quick-nav"/);
  assert.match(adminCss,/\.quick-nav/);
  assert.match(adminCss,/#settingsForm \.actions/);
});
