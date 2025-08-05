#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directories to scan
const directories = [
  'app',
  'components',
  'lib',
  'hooks',
  'contexts',
  'scripts'
];

// File extensions to check
const extensions = ['.ts', '.tsx', '.js', '.jsx'];

// Track findings
const findings = [];

// Parse imports from a file
function parseImports(content) {
  const imports = [];
  
  // Match ES6 imports
  const importRegex = /import\s+(?:type\s+)?(?:(\*\s+as\s+\w+)|(\w+)|(\{[^}]+\}))\s+from\s+['"]([^'"]+)['"]/g;
  const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g;
  
  let match;
  
  // Parse regular imports
  while ((match = importRegex.exec(content)) !== null) {
    const [fullMatch, namespaceImport, defaultImport, namedImports, module] = match;
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    if (namespaceImport) {
      const name = namespaceImport.replace(/\*\s+as\s+/, '').trim();
      imports.push({ name, module, line: lineNumber, type: 'namespace' });
    } else if (defaultImport) {
      imports.push({ name: defaultImport, module, line: lineNumber, type: 'default' });
    } else if (namedImports) {
      const names = namedImports
        .replace(/[{}]/g, '')
        .split(',')
        .map(n => n.trim())
        .filter(n => n)
        .map(n => {
          const parts = n.split(/\s+as\s+/);
          return parts.length > 1 ? parts[1] : parts[0];
        });
      
      names.forEach(name => {
        imports.push({ name, module, line: lineNumber, type: 'named' });
      });
    }
  }
  
  // Parse side-effect imports
  while ((match = sideEffectImportRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    imports.push({ name: null, module: match[1], line: lineNumber, type: 'side-effect' });
  }
  
  return imports;
}

// Check if an import is used in the file
function isImportUsed(content, importName, importType) {
  if (!importName || importType === 'side-effect') {
    return true; // Side-effect imports are always "used"
  }
  
  // Remove import statements from content to avoid false positives
  const contentWithoutImports = content.replace(/import[\s\S]*?from\s+['"][^'"]+['"]/g, '');
  
  // Create regex patterns for different usage scenarios
  const patterns = [
    // Direct usage
    new RegExp(`\\b${importName}\\b(?![\\w$])`, 'g'),
    // JSX component usage
    new RegExp(`<${importName}[\\s/>]`, 'g'),
    // JSX closing tag
    new RegExp(`</${importName}>`, 'g'),
    // Type annotation
    new RegExp(`:\\s*${importName}\\b`, 'g'),
    // Generic type parameter
    new RegExp(`<${importName}[\\s,>]`, 'g'),
    // Extends/implements
    new RegExp(`(?:extends|implements)\\s+${importName}\\b`, 'g'),
  ];
  
  return patterns.some(pattern => pattern.test(contentWithoutImports));
}

// Process a single file
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = parseImports(content);
    const unusedImports = [];
    
    imports.forEach(imp => {
      if (!isImportUsed(content, imp.name, imp.type)) {
        unusedImports.push(imp);
      }
    });
    
    if (unusedImports.length > 0) {
      findings.push({
        file: filePath,
        unusedImports
      });
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Recursively find files
function findFiles(dir) {
  const files = [];
  
  function walk(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);
      
      items.forEach(item => {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walk(itemPath);
        } else if (stat.isFile() && extensions.includes(path.extname(item))) {
          files.push(itemPath);
        }
      });
    } catch (error) {
      console.error(`Error reading directory ${currentPath}:`, error.message);
    }
  }
  
  walk(dir);
  return files;
}

// Main execution
console.log('Scanning for unused imports...\n');

directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (fs.existsSync(dirPath)) {
    const files = findFiles(dirPath);
    files.forEach(processFile);
  }
});

// Sort findings by directory
findings.sort((a, b) => a.file.localeCompare(b.file));

// Report findings
if (findings.length === 0) {
  console.log('No unused imports found!');
} else {
  console.log(`Found ${findings.length} files with unused imports:\n`);
  
  findings.forEach(({ file, unusedImports }) => {
    console.log(`\n${file}:`);
    unusedImports.forEach(imp => {
      const importInfo = imp.name ? `'${imp.name}' from '${imp.module}'` : `side-effect '${imp.module}'`;
      console.log(`  Line ${imp.line}: ${importInfo}`);
    });
  });
  
  // Summary by module
  const moduleStats = {};
  findings.forEach(({ unusedImports }) => {
    unusedImports.forEach(imp => {
      if (!moduleStats[imp.module]) {
        moduleStats[imp.module] = 0;
      }
      moduleStats[imp.module]++;
    });
  });
  
  console.log('\n\nMost commonly unused imports:');
  Object.entries(moduleStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([module, count]) => {
      console.log(`  ${module}: ${count} unused imports`);
    });
}