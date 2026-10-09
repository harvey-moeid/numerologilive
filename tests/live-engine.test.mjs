import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDob, LiveEngine } from "../live-engine.mjs";
const now = () => new Date("2026-10-09T08:00:00.000Z");
const e=(id,event,username,data={},roomId="10000")=>({id,event,roomId,data:{username,...data}});
test("DOB parsing validates real dates and skips future dates",()=>{
  assert.equal(extractDob("lahir 16/11/1996",now()),"1996-11-16");
  assert.equal(extractDob("16 November 1996",now()),"1996-11-16");
  assert.equal(extractDob("16111996",now()),"1996-11-16");
  assert.equal(extractDob("31/02/2000",now()),null);
  assert.equal(extractDob("10/12/2027",now()),null);
});
test("comment queues DOB, gift needs matching user and enough coins",()=>{
  const l=new LiveEngine({now,likeThreshold:400});
  assert.equal(l.handle(e("c","chat","alice",{message:"16-11-1996"})).type,"pending");
  assert.equal(l.handle(e("g0","gift","bob",{diamondCount:10})),null);
  assert.equal(l.handle(e("g1","gift","alice",{diamondCount:0})),null);
  const gift=l.handle(e("g2","gift","alice",{diamondCount:1,repeatCount:2,giftName:"Rose"}));
  assert.equal(gift.iso,"1996-11-16");
  assert.equal(gift.amount,2);
  assert.equal(l.handle(e("g2","gift","alice",{diamondCount:1})),null);
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
