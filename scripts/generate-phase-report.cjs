const fs = require('fs')
const path = require('path')
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require('docx')

function p(text, opts = {}) {
  return new Paragraph({ text, ...opts })
}

function bullets(items) {
  return items.map((item) => new Paragraph({
    text: item,
    bullet: { level: 0 }
  }))
}

;(async function main() {
  try {
    const outPath = path.resolve('d:/workspace/docs/Webpage_Phase_Report_2026-04-10.docx')
    const children = []

    children.push(p('Webpage Development Report', { heading: HeadingLevel.TITLE }))
    children.push(p('Project: GIS Spectral Web App'))
    children.push(p('Report Date: 2026-04-10'))
    children.push(p('Scope: Phase 1 completion verification and Phase 2 progression'))
    children.push(p(''))

    children.push(p('1. Executive Summary', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'Phase 1 is completed and validated: PCA-based grouping in Light basemap only, grouped marker colors, group panel, and grouped averaged spectrum visibility.',
      'Marker blinking issues in Light mode were diagnosed and mitigated by reducing unnecessary source reload and avoiding group-mode color fallback to black.',
      'Phase 2 has started and is active: Clustering method is implemented and wired to controls and map rendering.',
      'Phase 2 now includes clustering diagnostics and tuning controls (distance metric, initialization mode, compactness metric).'
    ]))

    children.push(p('2. Baseline Context', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'Frontend stack: React + Vite + Mapbox + Plotly.',
      'Main interaction model: basemap switcher, spectral analysis toolbar, map overlays, sample marker diagnostics.',
      'Grouping methods are intentionally basemap-scoped: active only in Light basemap to preserve behavior on Satellite and Street.'
    ]))

    children.push(p('3. Phase 1: Completed Scope', { heading: HeadingLevel.HEADING_1 }))
    children.push(p('3.1 Functional Goals Achieved', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'PCA grouping toggle and controls implemented in toolbar.',
      'PCA groups rendered as colored map markers in Light basemap.',
      'Group count control available (2 to 6 groups).',
      'PCA explained variance shown in group panel.',
      'Group averaged spectrum visibility added in group panel.',
      'PCA panel made resizable so plots remain readable with more groups.'
    ]))

    children.push(p('3.2 Stability/UX Fixes Completed', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'Basemap transition reliability improved by robust style handling.',
      'Marker flicker reduced by minimizing unnecessary source reload cycles.',
      'Grouping-mode rendering stabilized to prevent fallback to black markers.',
      'Heat spread behavior adjusted with screen-space clamp for close zoom usability.'
    ]))

    children.push(p('3.3 Primary Files Involved (Phase 1)', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'src/GlobeModal.jsx: grouping controls, group panel, grouped averaged spectrum plot, panel resize behavior.',
      'src/MapboxViewerClean.jsx: grouped marker expression rendering, anti-blink logic, overlay styling behavior.',
      'src/AveragedSpectrum.jsx: spectral matrix export and spectral grid export for grouped averages.',
      'src/lib/spectralGrouping.js: PCA grouping and deterministic grouping primitives.'
    ]))

    children.push(p('4. Phase 2: Current Progress', { heading: HeadingLevel.HEADING_1 }))
    children.push(p('4.1 Implemented in Phase 2', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'Clustering method is now a functional grouping path (not placeholder).',
      'Clustering method can be selected from Grouping Methods.',
      'Cluster assignments feed the same Light-basemap grouped marker rendering pipeline.',
      'Clustering quality metric (compactness) is computed and displayed in the group panel.'
    ]))

    children.push(p('4.2 New Phase 2 Controls', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'Distance metric selector: Euclidean or Manhattan.',
      'Initialization selector: Spread or KMeans++ style initialization.',
      'Groups slider reused for clustering group count tuning.'
    ]))

    children.push(p('4.3 Technical Details for Clustering', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'Input matrix is standardized before clustering for scale stability.',
      'K-means loop supports configurable distance function.',
      'Initialization strategy is selectable to improve convergence behavior.',
      'Compactness is calculated as sum of squared distances to assigned centroids.'
    ]))

    children.push(p('4.4 Primary Files Involved (Phase 2)', { heading: HeadingLevel.HEADING_2 }))
    children.push(...bullets([
      'src/lib/spectralGrouping.js: computeClusteringGrouping plus distance/init enhancements.',
      'src/GlobeModal.jsx: clustering controls, compute wiring, compactness readout.',
      'src/MapboxViewerClean.jsx: clustering method accepted as active grouping mode for Light map markers.'
    ]))

    children.push(p('5. Validation Status', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'Editor-level checks on modified files report no errors.',
      'Production build succeeded after Phase 1 and after Phase 2 additions.',
      'Known non-blocking warning: large plotly chunk size warning from build output.'
    ]))

    children.push(p('6. Known Risks / Open Items', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'Development server command reported intermittent failure in terminal context; build remains successful.',
      'Random Forest option is still intentionally marked as next and not yet implemented.',
      'Further anti-flicker hardening can be added by skipping source updates when integral payloads are unchanged.'
    ]))

    children.push(p('7. Recommended Next Steps', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'Phase 2 continuation: add group-count recommendation (elbow-based helper) for clustering.',
      'Add comparative metric trend (current vs previous compactness) for tuning feedback.',
      'Start Phase 3 planning once clustering UX is accepted and stable.'
    ]))

    children.push(p('8. Ongoing Documentation Policy', { heading: HeadingLevel.HEADING_1 }))
    children.push(...bullets([
      'A persistent work log file has been initialized in docs/WEBPAGE_WORK_LOG.md.',
      'All future changes should be appended with date, summary, files touched, and validation outcome.',
      'Future milestone reports can be generated by extending this script for new phases.'
    ]))

    const doc = new Document({
      sections: [{
        properties: {},
        children
      }]
    })

    const buf = await Packer.toBuffer(doc)
    fs.writeFileSync(outPath, buf)
    console.log(`Wrote detailed report: ${outPath}`)
  } catch (err) {
    console.error('Failed to generate phase report docx:', err)
    process.exit(1)
  }
})()
