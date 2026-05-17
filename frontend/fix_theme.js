const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content
        .replace(/bg-white/g, 'bg-card')
        .replace(/border-gray-100/g, 'border-border')
        .replace(/border-gray-200/g, 'border-border')
        .replace(/border-gray-300/g, 'border-border')
        .replace(/border-blue-200/g, 'border-brand-cornflower\/30')
        .replace(/bg-gray-50/g, 'bg-accent')
        .replace(/bg-gray-100/g, 'bg-border')
        .replace(/text-gray-700/g, 'text-muted-foreground')
        .replace(/text-blue-900/g, 'text-foreground')
        .replace(/text-blue-800/g, 'text-foreground')
        .replace(/text-blue-700/g, 'text-brand-cornflower')
        .replace(/text-blue-600/g, 'text-brand-cornflower');

      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

replaceInDir('c:/Users/Admin/OneDrive/Desktop/Growth autopilot/AutoPilot-Template/frontend/src/app');
