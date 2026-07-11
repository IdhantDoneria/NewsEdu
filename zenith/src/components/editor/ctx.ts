import { createContext, useContext } from 'react';

export interface DropTarget { id: string; zone: 'above' | 'below' | 'right' }

export interface EditorContextValue {
  pageId: string;
  readOnly: boolean;
  /** blockId -> contenteditable element */
  refs: Map<string, HTMLDivElement>;
  /** move caret to a block; at = 'start' | 'end' | char offset */
  focusBlock: (id: string, at?: 'start' | 'end' | number) => void;
  /** visible textish block ids in document order */
  flatIds: () => string[];
  dropTarget: DropTarget | null;
}

export const EditorCtx = createContext<EditorContextValue>({
  pageId: '',
  readOnly: false,
  refs: new Map(),
  focusBlock: () => {},
  flatIds: () => [],
  dropTarget: null,
});

export const useEditor = () => useContext(EditorCtx);
