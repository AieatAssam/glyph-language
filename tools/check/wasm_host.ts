// Host shim for the check package. Runs under Node 24 (type stripping), reads a JSON request
// file and prints a JSON result. Modes:
//   run       request {wasm, args?, dir?, stdin, fuel, memoryMb, stdoutLimit} -> toolkit run() result
//               (args and dir let the gates run a compiler module on a copied tree)
//   validate  request {files: [...]} -> [{file, ok, errors}] using toolkit validate()
// Imports the toolkit of the checker's own tree (../../toolkit), never the candidate repo's.
import { readFileSync } from 'node:fs';
import { run } from '../../toolkit/run.ts';
import { validate } from '../../toolkit/validate.ts';

const [mode, reqPath] = process.argv.slice(2);
const req = JSON.parse(readFileSync(reqPath, 'utf8'));

if (mode === 'run') {
  const r = await run(req.wasm, {
    args: req.args ?? [],
    dir: req.dir ?? undefined,
    stdin: req.stdin ?? '',
    fuel: req.fuel,
    memoryMb: req.memoryMb,
    stdoutLimit: req.stdoutLimit,
  });
  process.stdout.write(JSON.stringify(r));
} else if (mode === 'validate') {
  const out = req.files.map((f: string) => {
    const v = validate(readFileSync(f));
    return { file: f, ok: v.ok, errors: v.errors };
  });
  process.stdout.write(JSON.stringify(out));
} else {
  process.stderr.write(`wasm_host: unknown mode ${mode}\n`);
  process.exit(2);
}
