import { useStore } from "zustand";
import { spcStore } from "../store/spc-store.js";

export default function ShortcutOverlay() {
  const show = useStore(spcStore, (s) => s.ui?.shortcutOverlay);

  if (!show) return null;

  return (
    <div className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="shortcut-overlay-backdrop" data-action="close-shortcut-overlay" />
      <div className="shortcut-overlay-panel">
        <div className="shortcut-overlay-header">
          <h2 className="shortcut-overlay-title">Keyboard Shortcuts</h2>
          <button className="shortcut-overlay-close" data-action="close-shortcut-overlay" type="button" aria-label="Close">&times;</button>
        </div>
        <dl className="shortcut-list">
          <div className="shortcut-group-label">Violations</div>
          <div className="shortcut-row"><dt><kbd>n</kbd></dt><dd>Next violation point</dd></div>
          <div className="shortcut-row"><dt><kbd>p</kbd></dt><dd>Previous violation point</dd></div>
          <div className="shortcut-group-label">Data Prep</div>
          <div className="shortcut-row"><dt><kbd>r</kbd></dt><dd>Rename column</dd></div>
          <div className="shortcut-row"><dt><kbd>t</kbd></dt><dd>Change column type</dd></div>
          <div className="shortcut-row"><dt><kbd>c</kbd></dt><dd>Calculated column</dd></div>
          <div className="shortcut-row"><dt><kbd>f</kbd></dt><dd>Filter rows</dd></div>
          <div className="shortcut-row"><dt><kbd>d</kbd></dt><dd>Find &amp; replace</dd></div>
          <div className="shortcut-row"><dt><kbd>z</kbd></dt><dd>Undo last transform</dd></div>
          <div className="shortcut-group-label">Navigation</div>
          <div className="shortcut-row"><dt><kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt><dd>Move selected point</dd></div>
          <div className="shortcut-row"><dt><kbd>?</kbd></dt><dd>Toggle this help overlay</dd></div>
          <div className="shortcut-row"><dt><kbd>Esc</kbd></dt><dd>Close overlays / cancel</dd></div>
        </dl>
      </div>
    </div>
  );
}
