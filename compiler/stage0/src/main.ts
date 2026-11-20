// Entry point for the stage0 compiler. bin/glyphc reaches this file when compiler/ACTIVE says stage0.
// ponytail: only --version is implemented. check, run, build and fmt exit 2 with a message.
// Ceiling: no program can be compiled yet. Upgrade path: subtasks 9 to 11 of rfcs/0004.plan.md,
// once the lexer and checker from RFCs 0003 and 0005 exist.
const VERSION = 'glyphc stage0 0.0.0';

export function run(args: string[]): { code: number; out: string; err: string } {
  if (args.length === 1 && args[0] === '--version') {
    return { code: 0, out: VERSION + '\n', err: '' };
  }
  const shown = args.length === 0 ? '(no arguments)' : args.join(' ');
  return { code: 2, out: '', err: `glyphc: not implemented: ${shown}\n` };
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
