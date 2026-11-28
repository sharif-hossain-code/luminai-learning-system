import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the custom type scale from globals.css, so `text-body` is treated
// as a font size and doesn't remove colour utilities such as `text-primary-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'h1', 'h2', 'h3', 'body', 'support', 'caption', 'overline'] },
      ],
    },
  },
});

/** Joins class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
