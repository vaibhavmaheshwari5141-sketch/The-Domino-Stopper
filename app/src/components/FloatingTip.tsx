import { cloneElement, type ReactElement, type ReactNode, type SyntheticEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TriggerProps = {
  'aria-describedby'?: string;
  onMouseEnter?: (e: SyntheticEvent) => void;
  onMouseLeave?: (e: SyntheticEvent) => void;
  onFocus?: (e: SyntheticEvent) => void;
  onBlur?: (e: SyntheticEvent) => void;
};

/**
 * A tooltip drawn above the page (in a portal), so it is never clipped by a scrolling container such as the
 * horizontal flight chain. Shows on hover and keyboard focus, below the trigger or above it when there is no room.
 */
export function FloatingTip({ content, children }: { content: ReactNode; children: ReactElement<TriggerProps> }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const show = (e: SyntheticEvent) => setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
  const hide = () => setAnchor(null);

  // Place it once its size is known, kept inside the window
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const { width, height } = tip.getBoundingClientRect();
    const below = anchor.bottom + 8 + height <= window.innerHeight - 8;
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? anchor.bottom + 8 : anchor.top - height - 8}px`;
    tip.style.visibility = 'visible';
  }, [anchor]);

  // A scroll moves the trigger away from the tooltip, so close it
  useLayoutEffect(() => {
    if (!anchor) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [anchor]);

  const p = children.props;
  return (
    <>
      {cloneElement(children, {
        'aria-describedby': id,
        onMouseEnter: (e) => { p.onMouseEnter?.(e); show(e); },
        onMouseLeave: (e) => { p.onMouseLeave?.(e); hide(); },
        onFocus: (e) => { p.onFocus?.(e); show(e); },
        onBlur: (e) => { p.onBlur?.(e); hide(); },
      })}
      {/* Always in the document (hidden when idle) so aria-describedby points at real text */}
      {createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ visibility: 'hidden', left: -9999, top: -9999 }}
          className={`pointer-events-none fixed z-[60] w-max max-w-[300px] rounded-control border bg-surface px-3 py-2 text-xs leading-relaxed text-ink shadow-lg ${anchor ? '' : 'hidden'}`}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
