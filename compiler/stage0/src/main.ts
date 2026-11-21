// Entry point for stage0. bin/glyphc runs this file when compiler/ACTIVE says stage0.
import { run } from './cli.ts';

process.exitCode = run(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
