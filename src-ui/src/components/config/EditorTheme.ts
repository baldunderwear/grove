import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * Grove-branded dark theme for CodeMirror 6.
 * Maps Grove CSS variables to CodeMirror theme slots.
 *
 * Uses EditorView.theme() (CodeMirror 6 native) instead of createTheme
 * from @uiw/codemirror-themes since we only need @uiw/react-codemirror.
 */

const groveColors = {
  background: '#0c1810',   // --grove-deep
  foreground: '#eaede8',   // --grove-fog
  selection: '#1a3520',    // --grove-canopy
  cursor: '#4fa362',       // --grove-leaf
  gutterBg: '#080f0a',     // --grove-void
  gutterFg: '#a0a89e',     // --grove-stone
  activeLine: '#112416',   // --grove-forest
  moss: '#2d5a38',         // --grove-moss
  sprout: '#6dc280',       // --grove-sprout
  bright: '#8edc9f',       // --grove-bright
  amber: '#e89840',        // --grove-amber
  mist: '#b8f0c5',         // --grove-mist
};

/** Base editor chrome -- backgrounds, gutters, cursor, selection */
const groveBaseTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: groveColors.background,
      color: groveColors.foreground,
      fontSize: '13px',
      fontFamily: "'IBM Plex Mono', monospace",
    },
    '.cm-content': {
      caretColor: groveColors.cursor,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: groveColors.cursor,
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: groveColors.selection,
    },
    '.cm-gutters': {
      backgroundColor: groveColors.gutterBg,
      color: groveColors.gutterFg,
      borderRight: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: groveColors.activeLine,
    },
    '.cm-activeLine': {
      backgroundColor: `${groveColors.activeLine}40`,
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: groveColors.moss,
      outline: 'none',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: groveColors.cursor,
      cursor: 'pointer',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: groveColors.selection,
      border: 'none',
      color: groveColors.gutterFg,
      padding: '0 4px',
    },
    '.cm-tooltip': {
      backgroundColor: groveColors.background,
      border: `1px solid ${groveColors.selection}`,
    },
  },
  { dark: true }
);

/** Syntax highlighting colors for markdown, JSON, and general code */
const groveHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: groveColors.gutterFg, fontStyle: 'italic' },
  { tag: tags.keyword, color: groveColors.cursor },
  { tag: tags.string, color: groveColors.sprout },
  { tag: tags.number, color: groveColors.amber },
  { tag: tags.bool, color: groveColors.cursor },
  { tag: tags.null, color: groveColors.cursor },
  { tag: tags.heading, color: groveColors.bright, fontWeight: 'bold' },
  { tag: tags.link, color: groveColors.amber, textDecoration: 'underline' },
  { tag: tags.emphasis, color: groveColors.mist, fontStyle: 'italic' },
  { tag: tags.strong, color: groveColors.foreground, fontWeight: 'bold' },
  { tag: tags.url, color: groveColors.amber },
  { tag: tags.monospace, color: groveColors.sprout },
  { tag: tags.meta, color: groveColors.gutterFg },
  { tag: tags.processingInstruction, color: groveColors.cursor },
  { tag: tags.propertyName, color: groveColors.bright },
]);

/**
 * Complete Grove editor theme extension.
 * Combines base theme + syntax highlighting. Use as a CodeMirror extension:
 *
 *   <CodeMirror theme={groveEditorTheme} ... />
 *
 * Or via createTheme pattern if migrating to @uiw/codemirror-themes later.
 */
export const groveEditorTheme: Extension = [
  groveBaseTheme,
  syntaxHighlighting(groveHighlightStyle),
];
