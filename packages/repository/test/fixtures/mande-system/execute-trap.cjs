require('node:fs').writeFileSync('EXECUTED', 'Repository scripts must never run');
throw new Error('Repository scripts must never run');
