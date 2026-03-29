import { EditorView } from '@codemirror/view';

/**
 * Grove-branded dark theme for CodeMirror editors.
 * Maps Grove CSS variables to CodeMirror theme slots.
 */
export const groveEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0c1810',
      color: '#eaede8',
      fontSize: '13px',
      fontFamily: "'IBM Plex Mono', monospace",
    },
    '.cm-content': {
      caretColor: '#4fa362',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#4fa362',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#1a3520',
    },
    '.cm-gutters': {
      backgroundColor: '#080f0a',
      color: '#a0a89e',
      borderRight: '1px solid #1a3520',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#112416',
    },
    '.cm-activeLine': {
      backgroundColor: '#11241640',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: '#4fa362',
    },
    '.cm-tooltip': {
      backgroundColor: '#0c1810',
      border: '1px solid #1a3520',
    },
  },
  { dark: true }
);
