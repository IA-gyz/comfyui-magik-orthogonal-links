// Verify the bridge against a caller-supplied frontend 1.55.18 source file;
// upstream source is deliberately not bundled with the extension.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
if(!process.argv[2])throw Error('Usage: node tests/native_culling_source.mjs /path/to/LGraphCanvas.ts');
const source=await readFile(process.argv[2],'utf8');
const start=source.indexOf('  private _renderAllLinkSegments('),body=source.indexOf('  ) {',start),end=source.indexOf('\n  /**\n   * Build LinkRenderContext',body);
assert(start>=0 && body>start && end>body,'Frontend source layout differs; inspect compatibility before adapting');
let content=source.slice(body+6,end);
for(const [before,after] of [['const points: [Point, ...Point[], Point] =','const points ='],['let startControl: Point | undefined','let startControl']]){
 assert.equal(content.split(before).length,2,'Expected TypeScript annotation not found exactly once');content=content.replace(before,after);
}
const dir=await mkdtemp(join(tmpdir(),'magik-native-culling-'));
try {
 const file=join(dir,'native.mjs');
 await writeFile(file,'function(ctx,link,startPos,endPos,visibleReroutes,renderedRerouteSegments,now,startDirection,endDirection,disabled=false,startsAtBadge=false) {'+content);
 const run=spawnSync(process.execPath,[new URL('./viewport_ui.mjs',import.meta.url).pathname],{env:{...process.env,MAGIK_NATIVE_SEGMENTS:file},stdio:'inherit'});
 assert.equal(run.status,0,'Native source integration failed');
}finally{await rm(dir,{recursive:true,force:true});}
