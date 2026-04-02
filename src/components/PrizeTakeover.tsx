import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface Props {
  isMobile: boolean;
  isExiting: boolean;
  onExitComplete?: () => void;
}

export function PrizeTakeover({ isMobile, isExiting, onExitComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const entranceTlRef = useRef<gsap.core.Timeline | null>(null);

  // Entrance animation on mount
  useEffect(() => {
    const container = containerRef.current;
    const tagline = taglineRef.current;
    const headline = headlineRef.current;
    if (!container || !tagline || !headline) return;

    // Set initial state
    gsap.set(container, { opacity: 0 });
    gsap.set(tagline, { opacity: 0, y: 18 });
    gsap.set(headline, { opacity: 0, y: 24, scale: 0.88 });

    const tl = gsap.timeline();
    entranceTlRef.current = tl;

    // 1. Background fades in
    tl.to(container, { opacity: 1, duration: 0.55, ease: 'power2.out' })
      // 2. Tagline slides up
      .to(tagline, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.15')
      // 3. Headline scales + slides up with slight bounce
      .to(headline, { opacity: 1, y: 0, scale: 1, duration: 0.75, ease: 'back.out(1.6)' }, '-=0.2')
      // 4. After entrance — gentle breathe loop on headline
      .to(headline, {
        scale: 1.03,
        duration: 1.6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      }, '+=0.1');

    return () => { tl.kill(); };
  }, []);

  // Exit animation — triggered by isExiting prop
  useEffect(() => {
    if (!isExiting) return;
    const container = containerRef.current;
    const tagline = taglineRef.current;
    const headline = headlineRef.current;
    if (!container) return;

    // Kill entrance/breathe so it doesn't fight the exit
    entranceTlRef.current?.kill();

    const tl = gsap.timeline({ onComplete: onExitComplete });
    tl.to([headline, tagline], { opacity: 0, y: -12, duration: 0.3, ease: 'power2.in', stagger: 0.06 })
      .to(container, { opacity: 0, duration: 0.3, ease: 'power2.in' }, '-=0.15');

    return () => { tl.kill(); };
  }, [isExiting, onExitComplete]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: '#111111',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(0.75rem, 2vw, 1.5rem)',
        textAlign: 'center',
        padding: '0 clamp(1.5rem, 4vw, 4rem)',
      }}
    >
      <div
        ref={taglineRef}
        style={{
          fontSize: isMobile ? '1rem' : 'clamp(0.9rem, 1.5vw, 1.15rem)',
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Complete The Work Day. Stay Calm. Win Prizes.
      </div>
      <div
        ref={headlineRef}
        style={{
          fontSize: isMobile ? '2rem' : 'clamp(2.5rem, 6vw, 4.5rem)',
          fontFamily: 'Quicksand, sans-serif',
          fontWeight: 700,
          color: '#FF4200',
          textShadow: '0 0 60px #FF420080',
          lineHeight: 1.1,
          transformOrigin: 'center center',
        }}
      >
        Win a Brand New iPhone 17
      </div>
    </div>
  );
}
