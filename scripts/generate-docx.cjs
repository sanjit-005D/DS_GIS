const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require('docx');

(async function main(){
  try {
    const srcPath = path.resolve("D:/pro_rec/what we done.doc");
    const outPath = path.resolve("D:/pro_rec/what we done.docx");

    if (!fs.existsSync(srcPath)) {
      console.error('Source file not found:', srcPath);
      process.exit(1);
    }

    const raw = fs.readFileSync(srcPath, 'utf8');

    // Split into lines and create paragraphs. We'll detect the numbered sections and treat them as headings.
    const lines = raw.split(/\r?\n/).map(l => l.trim());

    // Build sections children array and pass into Document constructor
    const children = [];
    const doc = new Document({ sections: [{ properties: {}, children }] });

    // Title
    children.push(new Paragraph({
      text: 'What we done',
      heading: HeadingLevel.TITLE
    }));

    // Add a small metadata paragraph
    const dateLine = lines.find(l => l.startsWith('Date:')) || `Date: ${new Date().toISOString().slice(0,10)}`;
    children.push(new Paragraph({ children: [ new TextRun({ text: dateLine, bold: true }) ] }));
    children.push(new Paragraph({ text: "" }));

    // Ensure there are explicit task headings requested by user
    children.push(new Paragraph({ text: 'Tasks', heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: 'Database selector', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: 'Selector troubleshooting', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: '' }));

    // Append the rest of the original notes under "Details"
    children.push(new Paragraph({ text: 'Details', heading: HeadingLevel.HEADING_1 }));

    let bufferParagraph = [];
    for (let line of lines) {
      if (!line) {
        if (bufferParagraph.length) {
          children.push(new Paragraph(bufferParagraph.join(' ')));
          bufferParagraph = [];
        }
        continue;
      }
      // Avoid re-adding the title/date lines already included
      if (line.startsWith('What we done') || line.startsWith('Date:')) continue;
      bufferParagraph.push(line);
      // Flush if line looks like the start of a numbered section
      if (/^\d+\)/.test(line) || /^\d+\./.test(line)) {
        if (bufferParagraph.length) {
          children.push(new Paragraph(bufferParagraph.join(' ')));
          bufferParagraph = [];
        }
      } else if (bufferParagraph.join(' ').length > 800) {
        children.push(new Paragraph(bufferParagraph.join(' ')));
        bufferParagraph = [];
      }
    }
    if (bufferParagraph.length) children.push(new Paragraph(bufferParagraph.join(' ')));

  const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
    console.log('Wrote docx to', outPath);
  } catch (err) {
    console.error('Error creating docx:', err);
    process.exit(2);
  }
})();