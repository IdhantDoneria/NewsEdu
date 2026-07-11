import { Emitter } from './events';

/** Editor focus bus: PageView listens and moves the caret to the requested block. */
export const editorBus = new Emitter<{
  focus: { blockId: string; at: 'start' | 'end' };
  /** open the slash menu programmatically for a block */
  slash: { blockId: string };
}>();

export interface AIRequest {
  /** where the AI popover should anchor (viewport coords) */
  anchor: { x: number; y: number; y2?: number };
  pageId: string;
  /** block the request originated from (insert results after it) */
  blockId?: string;
  /** selected text, if invoked from the selection toolbar */
  selection?: string;
  /** preset action id, e.g. 'continue', 'summarize' */
  action?: string;
}

/** AI bus: editor fires open requests; the AI module renders the assistant UI. */
export const aiBus = new Emitter<{ open: AIRequest; close: void }>();

export function openAI(req: AIRequest): void {
  aiBus.emit('open', req);
}
