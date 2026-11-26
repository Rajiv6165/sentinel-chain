import { useState, useEffect } from 'react';

export default function StickyMiniNav() {
  const [visible, setVisible] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');

  const navItems = [
    { id: 'hero', label: 'Top', targetId: 'stage' },
    { id: 'live-checker', label: 'Live Checker', targetId: 'live-checker' },
    { id: 'engines', label: 'Engines', targetId: 'engines' },
    { id: 'benchmarks', label: 'Benchmarks', targetId: 'benchmarks' },
    { id: 'use-in-ci', label: 'Use in CI', targetId: 'use-in-ci' },
    { id: 'scanner', label: 'Scanner', targetId: 'scanner' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setVisible(scrollY > 480);

      // Force "Scanner" active when scrolled to the bottom of the page
      const isAtBottom = window.innerHeight + scrollY >= document.documentElement.scrollHeight - 50;
      if (isAtBottom) {
        setActiveSection('scanner');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const sectionIds = ['stage', 'live-checker', 'engines', 'benchmarks', 'use-in-ci', 'scanner'];
    const elements = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

    // rootMargin detects which section is nearest to the top of the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        // Force "Scanner" active when scrolled to the bottom of the page
        const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
        if (isAtBottom) {
          setActiveSection('scanner');
          return;
        }

        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          // Sort by proximity of element top to the top of viewport (offset by ~90px for fixed nav)
          intersecting.sort((a, b) => {
            const topA = a.boundingClientRect.top;
            const topB = b.boundingClientRect.top;
            return Math.abs(topA - 90) - Math.abs(topB - 90);
          });
          const targetId = intersecting[0].target.id;
          setActiveSection(targetId === 'stage' ? 'hero' : targetId);
        }
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: [0, 0.1, 0.25] }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [visible]);

  const scrollTo = (targetId) => {
    if (targetId === 'stage') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!visible) return null;

  return (
    <nav
      aria-label="Quick page navigation"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto transition-all duration-300"
      style={{ animation: 'fadeIn 0.25s ease-out forwards' }}
    >
      <div className="flex items-center gap-1 sm:gap-2 px-3 py-1.5 rounded-full bg-[#070B14]/95 backdrop-blur-2xl border border-[rgba(148,170,210,0.25)] shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
        {/* Brand Dot */}
        <div className="w-2.5 h-2.5 rounded-full bg-[#FFB547] mx-1 hidden sm:block animate-pulse" />

        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollTo(item.targetId)}
            className={`px-2.5 sm:px-3 py-1 rounded-full font-mono text-[11px] sm:text-xs transition-all cursor-pointer whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
              activeSection === item.id
                ? 'bg-[#FFB547] text-[#1A1206] font-semibold shadow-sm'
                : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
