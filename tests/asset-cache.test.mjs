import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("production HTML references newly versioned assets, not stale filenames", () => {
  const html = read("index.html");
  const admin = read("admin.html");
  for (const name of ["styles-v2.css","app-v2.js"]) {
    assert.match(html,new RegExp('(?:href|src)="/'+name.replaceAll(".","\\.")+'"'));
  }
  assert.match(admin, /href="\/admin-v2\.css"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|app\.js)"/);
  assert.doesNotMatch(admin, /href="\/admin\.css"/);
});

test("new asset versions contain latest production code", () => {
  for (const pair of [["styles.css","styles-v2.css"],["app.js","app-v2.js"],["admin.css","admin-v2.css"]]) {
    assert.equal(read(pair[1]),read(pair[0]),pair[1]+" must remain identical to current source");
  }
  assert.match(read("styles-v2.css"), /\.landing-layout/);
  assert.match(read("styles-v2.css"), /\.brand-mark/);
  assert.match(read("app-v2.js"), /getElementById\('calcForm'\)/);
});
