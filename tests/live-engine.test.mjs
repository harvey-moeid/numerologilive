import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDob, parseDob, LiveEngine } from "../live-engine.mjs";
const now=()=>new Date("2026-10-09T08:00:00.000Z");
const e=(id,event,username,data={},roomId="10000")=>({id,event,roomId,data:{username,...data}});

test("smart DOB accepts Indonesian, mixed, compact, ISO and Unicode formats",()=>{
  for(const comment of ["16/11/1996","16-11-1996","16.11.1996","16 11 96","16/11/96",
    "16 November 1996","Aku lahir 16 nov 96","16111996","1996-11-16",
    "tgl 16 bulan 11 tahun 96","saya lahir 16 bulan 11 tahun 96","tgl161196","161196"])
    assert.equal(extractDob(comment,now()),"1996-11-16",comment);
  assert.equal(extractDob("０１／０２／２０００",now()),"2000-02-01");
});
test("calendar validation rejects invalid, future, ambiguous and incomplete dates",()=>{
  for(const comment of ["31/02/2000","29/02/2001","10/12/2027","16 November","lahir 1996",
    "16/11","16/11/2026","01/01/1899","16/11/1996 atau 17/11/1996"]) {
    assert.equal(extractDob(comment,now()),null,comment);
    assert.equal(parseDob(comment,now()).status,"invalid",comment);
  }
  assert.equal(extractDob("29/02/2000",now()),"2000-02-29");
  assert.equal(parseDob("halo min berapa like?",now()).status,"none");
  assert.equal(parseDob("BUY BTC 500",now()).status,"none");
  assert.equal(parseDob("Kode promo 161196",now()).status,"none");
});
test("strict mode and disabled year correction never guess",()=>{
  assert.equal(extractDob("lahir 16/11/1996",now(),{mode:"strict"}),"1996-11-16");
  for(const value of ["16/11/96","16111996","16-11-1996","1996-11-16","16 Nov 1996"])
    assert.equal(parseDob(value,now(),{mode:"strict"}).status,"invalid",value);
  assert.equal(parseDob("16/11/96",now(),{autoCorrect:false}).status,"invalid");
  assert.equal(extractDob("16/11/1996",now(),{autoCorrect:false}),"1996-11-16");
  assert.equal(parseDob("161196",now(),{mode:"strict"}).status,"invalid");
});
test("gift requires own valid DOB and malformed correction revokes pending",()=>{
  const l=new LiveEngine({now,likeThreshold:400});
  assert.equal(l.handle(e("c","chat","alice",{message:"16-11-1996"})).type,"pending");
  assert.equal(l.handle(e("copy","chat","alice",{message:"16-11-1996"})),null);
  assert.equal(l.handle(e("g0","gift","bob",{diamondCount:10})),null);
  assert.equal(l.handle(e("g1","gift","alice",{diamondCount:0})),null);
  const gift=l.handle(e("g2","gift","alice",{diamondCount:1,repeatCount:2,giftName:"Rose"}));
  assert.equal(gift.iso,"1996-11-16"); assert.equal(gift.amount,2);
  assert.equal(l.handle(e("g2","gift","alice",{diamondCount:1})),null);
  assert.equal(l.handle(e("bad","chat","alice",{message:"tgl 31/02/2000"})).type,"invalid");
  assert.equal(l.handle(e("g3","gift","alice",{diamondCount:10})),null);
});
test("feedback ignores unrelated chat, per-user and global cooldown",()=>{
  let instant=now().getTime();
  const l=new LiveEngine({now:()=>new Date(instant),dobNoticeCooldownSeconds:30});
  assert.equal(l.handle(e("a1","chat","alice",{message:"hi everyone"})),null);
  assert.equal(l.handle(e("a2","chat","alice",{message:"tgl 16 november"})).type,"invalid");
  assert.equal(l.handle(e("a3","chat","alice",{message:"tgl 16 november"})),null);
  assert.equal(l.handle(e("b1","chat","bob",{message:"31/02/2000"})),null);
  instant+=5000;
  assert.equal(l.handle(e("b2","chat","bob",{message:"31/02/2000"})).type,"invalid");
  instant+=25000;
  assert.equal(l.handle(e("a4","chat","alice",{message:"31/02/2000"})).type,"invalid");
  const silent=new LiveEngine({now,dobErrorNotices:false});
  assert.equal(silent.handle(e("z1","chat","bob",{message:"tgl 31/02/2000"})),null);
});
test("likes count cumulatively and repeated milestone is respected",()=>{
  const l=new LiveEngine({now});
  l.handle(e("c","chat","alice",{message:"01/01/2000"}));
  assert.equal(l.handle(e("l1","like","alice",{likeCount:250})),null);
  assert.equal(l.handle(e("l2","like","alice",{likeCount:149})),null);
  assert.equal(l.handle(e("l3","like","alice",{likeCount:1})).via,"like");
  assert.equal(l.handle(e("l4","like","alice",{likeCount:1})),null);
  assert.equal(l.handle(e("l5","like","alice",{likeCount:399})).via,"like");
});
test("streak ignored until repeatEnd; stream restart clears session",()=>{
  const l=new LiveEngine({now});
  l.handle(e("c","chat","alice",{message:"01/01/2000"}));
  assert.equal(l.handle(e("g1","gift","alice",{giftType:1,diamondCount:1,repeatEnd:false})),null);
  assert.ok(l.handle(e("g2","gift","alice",{giftType:1,repeatCount:3,diamondCount:1,repeatEnd:true})));
  l.handle(e("s","stream","",{state:"started"}));
  assert.equal(l.handle(e("g3","gift","alice",{diamondCount:1})),null);
});
