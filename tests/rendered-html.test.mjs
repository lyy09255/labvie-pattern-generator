import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the LABVIE landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LABVIE Pattern Generator<\/title>/i);
  assert.match(html, /class="landingPage"/);
  assert.match(html, /alt="RPDCLavie"/);
  assert.match(html, />创建纹理\s*</);
  assert.match(html, />我的纹理库\s*</);
  assert.match(html, /src="\.\/logo1\.png"/);
  assert.match(html, /src="\.\/bg2\.png"/);
});

test("keeps the landing assets and editor transition in the project", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/bg1.png", import.meta.url)),
    access(new URL("../public/bg2.png", import.meta.url)),
    access(new URL("../public/logo1.png", import.meta.url)),
    access(new URL("../public/logo2.png", import.meta.url)),
    access(new URL("../public/niuzai.png", import.meta.url)),
  ]);

  assert.match(page, /useState<"home"\|"editor"\|"library">\("home"\)/);
  assert.match(page, /onClick=\{\(\)=>setView\("editor"\)\}/);
  assert.match(page, /image\.src=backgroundTextures\.find/);
  assert.match(page, /backgroundColorOpacity,backgroundBlendMode,backgroundImageRevision,view/);
  assert.match(page, />滤色<\/button>/);
  assert.match(page, />正片叠底<\/button>/);
  assert.match(page, />柔光<\/button>/);
  assert.match(page, /aria-label="纹理类型"/);
  assert.match(page, /label:"亚麻",image:"\.\/yama\.png/);
  assert.match(page, /label:"牛仔",image:"\.\/niuzai\.png/);
  assert.match(page, /label:"条纹",image:"\.\/tiaowen\.png/);
  assert.match(page, /label:"针织",image:"\.\/zhenzhi\.png/);
  assert.match(page, /className="clearImport" onClick=\{clearImportedImage\}>清除<\/button>/);
  assert.match(page, /labvie-pattern-library-v1/);
  assert.match(page, /保存至「纹理库」/);
  assert.match(page, /className="exportPngButton" onClick=\{exportPng\}>导出 PNG/);
  assert.match(page, /className="libraryTabs"/);
  assert.match(page, /className="brand" aria-label="返回首页" onClick=\{\(\)=>setView\("home"\)\}/);
  assert.match(page, /className="libraryLink" onClick=\{\(\)=>setView\("library"\)\}>我的纹理库/);
  assert.match(page, /className="sectionLabelTools"/);
  assert.match(page, /className="stageProject"/);
  assert.doesNotMatch(page, /aria-label="格纹样式"/);
  assert.match(page, /className="appShell"/);
  assert.match(css, /\.landingBackdrop/);
  assert.match(css, /url\("\/bg1\.png"\)/);
  assert.match(css, /--folder-brown:#562F15/);
  assert.match(css, /\.appShell \.stageProject/);
  assert.match(css, /@media\(max-width:760px\)/);
});
