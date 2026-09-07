export declare class MistLogo extends HTMLElement {
  canvas: HTMLCanvasElement;
  advance(deltaSeconds: number): void;
  stir(clientX: number, clientY: number): void;
  unstir(): void;
  blow(): void;
  replay(): void;
  seek(frame: number): void;
  release(): void;
}
