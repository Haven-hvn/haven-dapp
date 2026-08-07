declare module 'tailwind-merge' {
  export function twMerge(...inputs: (string | undefined | null | false)[]): string;
  export function twJoin(...inputs: (string | undefined | null | false)[]): string;
  export function createTailwindMerge(): typeof twMerge;
}

declare module '@arkiv-network/sdk/query' {
  export function eq(attribute: string, value: string | number | boolean): any;
  export function neq(attribute: string, value: string | number | boolean): any;
  export function gt(attribute: string, value: string | number): any;
  export function gte(attribute: string, value: string | number): any;
  export function lt(attribute: string, value: string | number): any;
  export function lte(attribute: string, value: string | number): any;
  export function and(...predicates: any[]): any;
  export function or(...predicates: any[]): any;
  export function not(predicate: any): any;
}
