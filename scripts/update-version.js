/**
 * Script to update version to timestamp format: YYYY.MMDD.HHMM
 * Run: node scripts/update-version.js
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');

function getTimestampVersion() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  // Format: YYYY.MMDD.HHMM (e.g., 2025.1223.1430)
  return `${year}.${month}${day}.${hours}${minutes}`;
}

function updateVersion() {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const newVersion = getTimestampVersion();
  
  console.log(`Updating version: ${pkg.version} → ${newVersion}`);
  
  pkg.version = newVersion;
  
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  
  console.log(`✓ Version updated to ${newVersion}`);
  return newVersion;
}

// Run if called directly
if (require.main === module) {
  updateVersion();
}

module.exports = { updateVersion, getTimestampVersion };
