import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkDir = join(root, 'haven-aol-main', 'packages', 'typescript');

if (!existsSync(join(sdkDir, 'package.json'))) {
  console.log(
    'Skipping haven-aol SDK install: clone https://github.com/Haven-hvn/haven-aol to haven-aol-main'
  );
  process.exit(0);
}

execSync('npm ci', { cwd: sdkDir, stdio: 'inherit' });
