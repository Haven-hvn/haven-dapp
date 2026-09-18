declare module 'tailwind-merge' {
  export function twMerge(...inputs: (string | undefined | null | false)[]): string;
  export function twJoin(...inputs: (string | undefined | null | false)[]): string;
  export function createTailwindMerge(): typeof twMerge;
}
