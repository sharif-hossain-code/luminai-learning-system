/**
 * The WHATWG URL class exists in every runtime that uses this package (Node 22+
 * and browsers), but the package compiles against the plain ES library only.
 */
declare class URL {
  constructor(input: string, base?: string);
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  toString(): string;
}
