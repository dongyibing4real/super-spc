/**
 * morph.js — Thin morphdom wrapper with project-specific configuration.
 *
 * Provides DOM diffing/patching instead of innerHTML/outerHTML replacement.
 * Preserves focus, scroll position, and D3-managed SVG chart nodes.
 */
import morphdom from "morphdom";

function isChartMountId(id) {
  return typeof id === "string" && id.startsWith("chart-mount-");
}

export function shouldPreserveDuringMorph(fromEl, activeElement = document.activeElement) {
  // Preserve D3-managed chart containers — morphdom must not touch these
  if (isChartMountId(fromEl?.id)) return true;

  // Preserve the currently focused input/select so chip editors keep focus
  if (
    fromEl === activeElement &&
    (fromEl?.tagName === "INPUT" || fromEl?.tagName === "SELECT")
  ) {
    return true;
  }

  return false;
}

const DEFAULT_OPTIONS = {
  onBeforeElUpdated(fromEl, toEl) {
    if (shouldPreserveDuringMorph(fromEl)) return false;

    return true;
  },
};

/**
 * Morph children of a container (replaces `el.innerHTML = html`).
 * Wraps the new HTML in a matching container tag so morphdom can diff children.
 */
export function morphInner(container, html) {
  const wrapper = document.createElement(container.tagName);
  // Copy attributes so morphdom sees a matching root
  for (const attr of container.attributes) {
    wrapper.setAttribute(attr.name, attr.value);
  }
  wrapper.innerHTML = html;
  morphdom(container, wrapper, { ...DEFAULT_OPTIONS, childrenOnly: true });
}

/**
 * Morph an element in-place (replaces `el.outerHTML = html`).
 * Returns the morphed element (same reference if tag didn't change).
 */
export function morphEl(el, html) {
  return morphdom(el, html, DEFAULT_OPTIONS);
}
