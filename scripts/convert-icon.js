/**
 * Script to convert PNG icon to ICO format for Windows
 * Run: node scripts/convert-icon.js
 */

const pngToIco = require('png-to-ico');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
const pngPath = path.join(assetsDir, 'icon.png');
const squarePngPath = path.join(assetsDir, 'icon-square.png');
const icoPath = path.join(assetsDir, 'icon.ico');

async function convertIcon() {
  console.log('Processing icon...');
  
  if (!fs.existsSync(pngPath)) {
    console.error('Error: icon.png not found in assets folder!');
    console.log('Please save your icon as: assets/icon.png');
    process.exit(1);
  }

  try {
    // Get image metadata
    const metadata = await sharp(pngPath).metadata();
    console.log(`Original size: ${metadata.width}x${metadata.height}`);
    
    // Make it square by using the larger dimension
    const size = Math.max(metadata.width, metadata.height);
    
    // Resize to 256x256 square (standard Windows icon size)
    await sharp(pngPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(squarePngPath);
    
    console.log('✓ Created 256x256 square icon');
    
    // Convert to ICO
    const buf = await pngToIco.default(squarePngPath);
    fs.writeFileSync(icoPath, buf);
    console.log('✓ Successfully created icon.ico');
    
    // Clean up temp file
    fs.unlinkSync(squarePngPath);
    
  } catch (error) {
    console.error('Error converting icon:', error.message);
    process.exit(1);
  }
}

convertIcon();
