const fs = require('fs');
const path = require('path');
const child = require('child_process');

const statesDir = path.resolve(__dirname,'..','public','state-districts');
const outDir = path.resolve(__dirname,'..','public','state-polygons');
if(!fs.existsSync(statesDir)){ console.error('missing', statesDir); process.exit(1); }
if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });

const files = fs.readdirSync(statesDir).filter(f=>f.endsWith('.geojson'));
for(const file of files){
  const inPath = path.join(statesDir,file);
  const base = path.basename(file, '.geojson');
  const outPath = path.join(outDir, base + '.geojson');
  console.log('Processing', base);
  // run local mapshaper binary if present, otherwise npx
  // Use npx mapshaper via shell on Windows to avoid spawn issues with .cmd wrappers
  const useNpx = true;
  let res;
  if(useNpx){
    const cmdLine = `npx mapshaper "${inPath}" -dissolve -o format=geojson "${outPath}"`;
    res = child.spawnSync(cmdLine, { stdio: 'inherit', shell: true });
  } else {
    const bin = path.resolve(__dirname,'..','node_modules','.bin','mapshaper' + (process.platform==='win32'?'.cmd':''));
    const cmd = fs.existsSync(bin) ? bin : 'npx';
    const args = fs.existsSync(bin) ? [inPath, '-dissolve', '-o', 'format=geojson', outPath] : ['mapshaper', inPath, '-dissolve', '-o', 'format=geojson', outPath];
    res = child.spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  }
  if(res.error){ console.error('failed', base, res.error); }
}
console.log('Done');
