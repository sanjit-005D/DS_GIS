const fs = require('fs');
const path = require('path');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJSON(p,obj){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, JSON.stringify(obj)); }

function slugify(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

function centroidOfCoords(coords){
  // coords: array of [lon,lat] (first ring). approximate centroid: average vertices
  let x=0,y=0,n=0;
  for(const c of coords){ x += c[0]; y += c[1]; n++; }
  return n? [x/n, y/n] : null;
}

function centroidOfFeature(feat){
  const g = feat.geometry;
  if(!g) return null;
  if(g.type === 'Polygon'){
    return centroidOfCoords(g.coordinates[0]);
  } else if(g.type === 'MultiPolygon'){
    // average centroids of polygons weighted equally
    const cents = g.coordinates.map(poly => centroidOfCoords(poly[0])).filter(Boolean);
    if(cents.length===0) return null;
    let x=0,y=0; for(const c of cents){ x+=c[0]; y+=c[1]; }
    return [x/cents.length, y/cents.length];
  } else if(g.type === 'Point'){
    return g.coordinates;
  }
  return null;
}

// haversine distance (km)
function haversine(a,b){
  const toRad = r => r*Math.PI/180;
  const [lon1,lat1]=a; const [lon2,lat2]=b;
  const R=6371;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const la1 = toRad(lat1), la2 = toRad(lat2);
  const h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 2*R*Math.asin(Math.sqrt(h));
}

const workspaceRoot = path.resolve(__dirname,'..');
const geoBoundariesPath = path.join(workspaceRoot,'tmp','geoBoundaries','geoBoundaries-IND-ADM4_simplified.geojson');
const statesPath = path.join(workspaceRoot,'public','india_states.geojson');
const outDir = path.join(workspaceRoot,'public','state-districts');

if(!fs.existsSync(geoBoundariesPath)){
  console.error('geoBoundaries simplified geojson not found at', geoBoundariesPath);
  process.exit(1);
}
if(!fs.existsSync(statesPath)){
  console.error('india_states.geojson not found at', statesPath);
  process.exit(1);
}

console.log('Reading states...', statesPath);
const states = readJSON(statesPath).features.map(f=>({ name: f.properties && (f.properties.name||f.properties.NAME||f.properties.state) || 'unknown', coords: f.geometry && f.geometry.coordinates }));
console.log('Found', states.length, 'states');

console.log('Reading districts (geoBoundaries simplified)...');
const districtsFC = readJSON(geoBoundariesPath);
const total = districtsFC.features.length;
console.log('Total district features:', total);

// prepare buckets
const buckets = {}; for(const s of states){ buckets[slugify(s.name)] = { name: s.name, features: [] }; }

let unassigned = 0;
for(const feat of districtsFC.features){
  const c = centroidOfFeature(feat);
  if(!c){ unassigned++; continue; }
  // find nearest state
  let bestIdx = -1; let bestD = Infinity;
  for(let i=0;i<states.length;i++){
    const s = states[i];
    if(!s.coords) continue;
    const d = haversine([c[0],c[1]],[s.coords[0],s.coords[1]]);
    if(d < bestD){ bestD = d; bestIdx = i; }
  }
  if(bestIdx === -1){ unassigned++; continue; }
  const stateName = states[bestIdx].name;
  const key = slugify(stateName);
  if(!buckets[key]) buckets[key] = { name: stateName, features: [] };
  buckets[key].features.push(feat);
}

// write per-state files
let written = 0;
for(const k of Object.keys(buckets)){
  const group = buckets[k];
  if(group.features.length === 0) continue;
  const out = { type: 'FeatureCollection', features: group.features };
  const outPath = path.join(outDir, `${k}.geojson`);
  writeJSON(outPath, out);
  written++;
  console.log('Wrote', outPath, 'features:', group.features.length);
}

console.log('Done. states written:', written, 'unassigned districts:', unassigned);
