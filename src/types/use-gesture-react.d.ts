// Minimal TypeScript declarations to satisfy imports from '@use-gesture/react'
// This avoids "Cannot find module '@use-gesture/react' or its corresponding type declarations."

declare module '@use-gesture/react' {
  // We keep types loose here; if you need stricter typing later, we can refine these.

  // Generic gesture state placeholders
  export interface DragState {
    [key: string]: any;
  }

  export interface PinchState {
    [key: string]: any;
  }

  // Hook signature kept generic to avoid over-constraining usage sites.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useGesture(...args: any[]): any;
}


