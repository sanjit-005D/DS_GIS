const fs = require('fs');
const path = require('path');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJSON(p,obj){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, JSON.stringify(obj)); }
function slugify(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

function centroidOfCoords(coords){
  let x=0,y=0,n=0; for(const c of coords){ x+=c[0]; y+=c[1]; n++; } return n?[x/n,y/n]:null;
}
function centroidOfFeature(feat){
  const g=feat.geometry; if(!g) return null;
  if(g.type==='Polygon') return centroidOfCoords(g.coordinates[0]);
  if(g.type==='MultiPolygon'){
    const cents = g.coordinates.map(poly=>centroidOfCoords(poly[0])).filter(Boolean);
    if(cents.length===0) return null; let x=0,y=0; for(const c of cents){x+=c[0];y+=c[1];} return [x/cents.length,y/cents.length];
  }
  if(g.type==='Point') return g.coordinates;
  return null;
}

// ray-cast point in ring (non-zero winding not needed for simple geojson)
function pointInRing(pt, ring){
  const [x,y]=pt; let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1];
    const xj=ring[j][0], yj=ring[j][1];
    const intersect = ((yi>y) !== (yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt, polygon){
  // polygon: array of rings (first is outer, rest are holes)
  if(!polygon || polygon.length===0) return false;
  if(!pointInRing(pt, polygon[0])) return false; // not in outer
  // ensure not in any hole
  for(let i=1;i<polygon.length;i++){
    if(pointInRing(pt, polygon[i])) return false;
  }
  return true;
}

function featurePolygons(feat){
  const g=feat.geometry; if(!g) return [];
  if(g.type==='Polygon') return [g.coordinates];
  if(g.type==='MultiPolygon') return g.coordinates; // array of polygons (each polygon = array of rings)
  return [];
}

const workspaceRoot = path.resolve(__dirname,'..');
// Use the unsimplified geoBoundaries ADM4 source for better accuracy during containment checks
const districtsPath = path.join(workspaceRoot,'tmp','geoBoundaries','geoBoundaries-IND-ADM4.geojson');
const statesDir = path.join(workspaceRoot,'public','state-districts');

if(!fs.existsSync(districtsPath)){
  console.error('districts source not found:', districtsPath); process.exit(1);
}
if(!fs.existsSync(statesDir)){
  console.error('state-districts directory not found:', statesDir); process.exit(1);
}

console.log('Loading districts source...');
const districtsFC = readJSON(districtsPath);
console.log('Loading existing per-state files from', statesDir);
const stateFiles = fs.readdirSync(statesDir).filter(f=>f.endsWith('.geojson'));

const states = [];
const currentAssign = {}; // shapeID -> stateKey
for(const file of stateFiles){
  const key = path.basename(file,'.geojson');
  const fc = readJSON(path.join(statesDir,file));
  const polygons = [];
  for(const feat of fc.features){
    // map id
    const id = feat.properties && (feat.properties.shapeID || feat.properties.SHAPEID || feat.properties.id || feat.properties.shapeName) || null;
    if(id) currentAssign[id] = key;
    const polys = featurePolygons(feat);
    for(const p of polys) polygons.push(p);
  }
  states.push({ key, polygons });
}
console.log('States loaded:', states.length);

// For each district, check which state's polygons contain its centroid
let reassignCount = 0, total=0;
const newBuckets = {}; for(const s of states) newBuckets[s.key] = [];

for(const feat of districtsFC.features){
  total++;
  const id = feat.properties && (feat.properties.shapeID || feat.properties.SHAPEID || feat.properties.id || feat.properties.shapeName) || null;
  const centroid = centroidOfFeature(feat);
  if(!centroid){
    // fallback to previous assignment if exists
    if(id && currentAssign[id]) newBuckets[currentAssign[id]].push(feat);
    continue;
  }
  let containing = null;
  for(const s of states){
    for(const poly of s.polygons){
      if(pointInPolygon(centroid, poly)) { containing = s.key; break; }
    }
    if(containing) break;
  }
  if(!containing){
    // fallback: use previous assignment if any, else assign to nearest state centroid key by bounding box distance
    if(id && currentAssign[id]) containing = currentAssign[id];
    else {
      // nearest by distance to state's first polygon centroid
      let best=null, bestD=Infinity;
      for(const s of states){
        if(s.polygons.length===0) continue;
        const p0 = s.polygons[0][0]; // first ring
        const c = centroidOfCoords(p0);
        if(!c) continue;
        const d = Math.hypot(c[0]-centroid[0], c[1]-centroid[1]);
        if(d<bestD){ bestD=d; best=s.key; }
      }
      containing = best || Object.keys(newBuckets)[0];
    }
  }
  // record
  if(id && currentAssign[id] && currentAssign[id] !== containing) reassignCount++;
  newBuckets[containing] = newBuckets[containing] || [];
  newBuckets[containing].push(feat);
}

// write back corrected files
let written = 0;
for(const k of Object.keys(newBuckets)){
  const arr = newBuckets[k];
  if(!arr || arr.length===0) continue;
  const out = { type: 'FeatureCollection', features: arr };
  const outPath = path.join(statesDir, `${k}.geojson`);
  writeJSON(outPath, out);
  written++;
  console.log('Wrote', outPath, 'features:', arr.length);
}

console.log('Done. total districts processed:', total, 'reassignments detected:', reassignCount, 'state files written:', written);
