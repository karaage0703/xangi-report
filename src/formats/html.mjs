import { requireValue } from '../errors.mjs';
export const format = 'html';
export const mediaType = 'text/html; charset=utf-8';
export const maxBytes = 2 * 1024 * 1024;
// Only the optional viewing response receives this measurement bridge. Stored
// originals, downloads and the plain view endpoint remain byte-for-byte intact.
// The sandbox stays opaque; the parent accepts only bounded dimensions from its
// own frame and never reads or trusts the report DOM.
export function presentation(content) {
  return (
    content +
    `\n<script>
(() => {
  let width, height;
  let resizeRun = 0;
  const appliedGrowth = (previous, viewport) =>
    previous && previous.viewport < viewport && previous.size === viewport;
  const measure = (viewport, extent, previous) => {
    if (previous?.viewport === viewport && previous.extent === extent) return previous;
    const growingWithViewport = extent > viewport &&
      (appliedGrowth(previous, viewport) || (resizeRun >= 2 && extent > previous?.extent));
    return { viewport, extent, size: growingWithViewport ? viewport : extent };
  };
  const send = () => {
    const root = document.documentElement, body = document.body;
    if (!root || !body) return;
    const rect = body.getBoundingClientRect();
    // Viewport-sized bodies (100vh/100vw) must not grow the iframe again on
    // every measurement because of their default margins.
    const viewportWidth = Math.abs(rect.width-innerWidth)<1;
    const viewportHeight = Math.abs(rect.height-innerHeight)<1;
    const widthExtent = Math.ceil(Math.max(innerWidth,body.scrollWidth,rect.width,viewportWidth?0:Math.max(root.scrollWidth,rect.right)));
    const heightExtent = Math.ceil(Math.max(innerHeight,body.scrollHeight,rect.height,viewportHeight?0:Math.max(root.scrollHeight,rect.bottom)));
    if (width?.viewport !== innerWidth || height?.viewport !== innerHeight) {
      // A width change may legitimately require a height adjustment. Stop
      // further growth when both adjustments feed back into the content.
      resizeRun = appliedGrowth(width, innerWidth) || appliedGrowth(height, innerHeight)
        ? resizeRun + 1 : 0;
    } else if (widthExtent !== width.extent || heightExtent !== height.extent) {
      // Content changed without an iframe resize, for example after a click.
      resizeRun = 0;
    }
    const nextWidth = measure(innerWidth, widthExtent, width);
    const nextHeight = measure(innerHeight, heightExtent, height);
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    parent.postMessage({type:'xangi-report-size',url:location.href,width:width.size,height:height.size}, '*');
  };
  let queued = false;
  const update = () => { if (queued) return; queued = true; requestAnimationFrame(() => {queued=false;send()}); };
  addEventListener('load',update);addEventListener('resize',update);
  addEventListener('DOMContentLoaded',() => {
    new ResizeObserver(update).observe(document.body);
    new MutationObserver(update).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
    document.fonts?.ready.then(update);update();
  });
  update();
})();
<\/script>`
  );
}
export function validate(content) {
  requireValue(typeof content === 'string' && content.trim().length > 0, 'HTMLを指定してください');
  requireValue(Buffer.byteLength(content) <= maxBytes, 'HTMLは2 MiBまでです', 413);
  return content;
}
// The original is not rewritten or sanitized. Isolation is enforced on every
// viewing response, including direct navigation, independently of the UI iframe.
export const viewingCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' data: blob:",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts',
].join('; ');
