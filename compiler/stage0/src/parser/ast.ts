// AST node types for the kernel (RFC 0109 Design; RFC 0104 grammar). Types and one const list
// only: no logic and no import. Every node has a span: byte offsets, start inclusive, end
// exclusive. Each node's `kind` is unique across the union, so a switch on `kind` covers it.
// parser/decl.ts and parser/expr.ts keep their own shapes until a later subtask moves them here.

export interface Span {
  start: number;
  end: number;
}

// A declared name or a type name (`Int`, `Bool`).
export interface Ident extends Span {
  kind: 'ident';
  text: string;
}

export interface Param extends Span {
  kind: 'param';
  name: Ident;
  type: Ident;
}

// params is null for a declaration with no parentheses (G9). result and io are null when absent.
// io is the span of the `io` keyword.
export interface Decl extends Span {
  kind: 'decl';
  name: Ident;
  params: Param[] | null;
  result: Ident | null;
  io: Span | null;
  body: Block;
  examples: Example[];
}

// From the `ex` keyword to the end of its expression.
export interface Example extends Span {
  kind: 'example';
  expr: Expr;
}

export interface Block extends Span {
  kind: 'block';
  stmts: Stmt[];
}

export interface LetStmt extends Span {
  kind: 'let';
  name: Ident;
  value: Expr;
}

export interface VarStmt extends Span {
  kind: 'var';
  name: Ident;
  value: Expr;
}

export interface AssignStmt extends Span {
  kind: 'assign';
  target: Ident;
  value: Expr;
}

// A call used as a statement (T5). The call is a CallExpr.
export interface CallStmt extends Span {
  kind: 'call-stmt';
  call: CallExpr;
}

export interface PutStmt extends Span {
  kind: 'put';
  value: Expr;
}

// elseBlock is null when there is no `else` part (C1).
export interface IfStmt extends Span {
  kind: 'if';
  cond: Expr;
  thenBlock: Block;
  elseBlock: Block | null;
}

export interface WhStmt extends Span {
  kind: 'wh';
  cond: Expr;
  body: Block;
}

// value is null for a bare `ret` (C2).
export interface RetStmt extends Span {
  kind: 'ret';
  value: Expr | null;
}

export type Stmt = LetStmt | VarStmt | AssignStmt | CallStmt | PutStmt | IfStmt | WhStmt | RetStmt;

export interface IntLit extends Span {
  kind: 'int';
  text: string;
}

export interface BoolLit extends Span {
  kind: 'bool';
  value: boolean;
}

// The decoded bytes of a text literal (T3).
export interface TextLit extends Span {
  kind: 'text';
  text: string;
}

export interface NameExpr extends Span {
  kind: 'name';
  text: string;
}

export interface CallExpr extends Span {
  kind: 'call';
  callee: Ident;
  args: Expr[];
}

export interface UnaryExpr extends Span {
  kind: 'unary';
  op: '-' | 'not';
  operand: Expr;
}

export type BinaryOp = 'or' | 'and' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | '%';

export interface BinaryExpr extends Span {
  kind: 'binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export type Expr = IntLit | BoolLit | TextLit | NameExpr | CallExpr | UnaryExpr | BinaryExpr;

export type Node = Decl | Param | Ident | Example | Block | Stmt | Expr;

export type NodeKind = Node['kind'];

// Every node kind, once each. ast.test.ts checks the list has no repeat and the count is twenty.
export const NODE_KINDS = [
  'decl', 'param', 'ident', 'example', 'block',
  'let', 'var', 'assign', 'call-stmt', 'put', 'if', 'wh', 'ret',
  'int', 'bool', 'text', 'name', 'call', 'unary', 'binary',
] as const;

// Fails to type-check if a kind in NodeKind is missing from NODE_KINDS (run by tsc, not by node).
export const allKindsListed: [Exclude<NodeKind, (typeof NODE_KINDS)[number]>] extends [never] ? true : false = true;
