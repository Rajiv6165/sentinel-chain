import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function Nav() {
  const [apiStatus, setApiStatus] = useState('CHECKING'); // ONLINE, WAKING UP, OFFLINE
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;

    const checkHealth = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const res = await fetch(`${API_BASE_URL}/api/health`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          if (isMounted) setApiStatus('ONLINE');
        } else {
          throw new Error('Non-200');
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (isMounted) {
          if (retryCount < 2) {
            setApiStatus('WAKING UP');
            retryCount++;
            setTimeout(checkHealth, 3000);
          } else {
            setApiStatus('OFFLINE');
          }
        }
      }
    };

    checkHealth();

    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const scrollTo = (id) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      className="anim-nav coord-nav flex items-center justify-between z-30 pointer-events-auto"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Brand left */}
      <a
        href="#"
        className="flex items-center gap-[calc(8*var(--u))] text-decoration-none group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FFB547] rounded-[calc(8*var(--u))] flex-shrink-0"
        title="Sentinel-Chain home"
      >
        {/* 30u Mark: two small circles --text joined by line to one --accent circle */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="flex-shrink-0"
        >
          <line x1="6" y1="8" x2="15" y2="22" stroke="rgba(148,170,210,0.35)" strokeWidth="1.5" />
          <line x1="24" y1="8" x2="15" y2="22" stroke="#FFB547" strokeWidth="1.5" />
          <circle cx="6" cy="8" r="3.5" fill="#EAF0FA" />
          <circle cx="24" cy="8" r="3.5" fill="#EAF0FA" />
          <circle cx="15" cy="22" r="4.5" fill="#FFB547" />
        </svg>

        <span className="font-sans font-semibold text-[16px] md:text-[calc(17*var(--u))] tracking-[-0.01em] text-[#EAF0FA] group-hover:text-white transition-colors whitespace-nowrap">
          Sentinel-Chain
        </span>
      </a>

      {/* Links centered at x=720u (hidden in compact and tablet) */}
      <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-[calc(40*var(--u))]">
        <button
          onClick={() => scrollTo('engines')}
          className="bg-transparent border-0 font-sans text-[calc(15*var(--u))] font-[450] text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors cursor-pointer p-0 focus:outline-none focus:ring-1 focus:ring-[#FFB547]"
        >
          Engines
        </button>
        <a
          href="https://github.com/rajivthakker/sentinel-chain/blob/main/docs/benchmarks.md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[calc(15*var(--u))] font-[450] text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors focus:outline-none focus:ring-1 focus:ring-[#FFB547]"
        >
          Benchmarks
        </a>
        <a
          href="https://github.com/rajivthakker/sentinel-chain/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[calc(15*var(--u))] font-[450] text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors focus:outline-none focus:ring-1 focus:ring-[#FFB547]"
        >
          Docs
        </a>
        <a
          href="https://github.com/rajivthakker/sentinel-chain"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[calc(15*var(--u))] font-[450] text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors focus:outline-none focus:ring-1 focus:ring-[#FFB547]"
        >
          GitHub
        </a>
      </div>

      {/* Right Edge: API status pill + Ghost button */}
      <div className="flex items-center gap-[calc(16*var(--u))]">
        {/* Status Pill */}
        <div
          className="flex items-center gap-[calc(6*var(--u))] px-[calc(10*var(--u))] py-[calc(4*var(--u))] rounded-full border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/80 backdrop-blur-sm"
          title={apiStatus === 'WAKING UP' ? 'Free tier waking up, ~30s' : `Backend API: ${apiStatus}`}
        >
          <span
            className={`w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full ${
              apiStatus === 'ONLINE'
                ? 'bg-[#4FE3C1] shadow-[0_0_8px_#4FE3C1]'
                : apiStatus === 'WAKING UP'
                ? 'bg-[#FFB547] animate-pulse shadow-[0_0_8px_#FFB547]'
                : 'bg-[#FF5A5F]'
            }`}
          />
          <span className="font-mono text-[calc(10.5*var(--u))] uppercase font-medium text-[#9AA7BD] tracking-[0.05em] select-none">
            {apiStatus === 'WAKING UP' ? 'WAKING UP (~30s)' : apiStatus}
          </span>
        </div>

        {/* Ghost button: Launch scanner (shown on desktop) */}
        <button
          onClick={() => scrollTo('scanner')}
          className="hidden lg:flex w-[calc(148*var(--u))] h-[calc(40*var(--u))] rounded-[calc(10*var(--u))] border border-[rgba(148,170,210,0.28)] bg-transparent hover:border-[#FFB547] text-[#EAF0FA] font-sans font-medium text-[calc(13*var(--u))] transition-all items-center justify-center cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FFB547]"
        >
          Launch scanner
        </button>

        {/* Burger menu for tablet and compact viewports */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex lg:hidden p-2 text-[#9AA7BD] hover:text-[#EAF0FA] focus:outline-none focus:ring-2 focus:ring-[#FFB547] rounded-lg"
          aria-label="Toggle navigation menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile & Tablet Drawer / Sheet */}
      {menuOpen && (
        <div className="flex lg:hidden fixed inset-x-0 top-[60px] bg-[#070B14]/98 backdrop-blur-2xl border-b border-[rgba(148,170,210,0.16)] p-6 z-50 flex-col gap-4 shadow-2xl">
          <button
            onClick={() => scrollTo('engines')}
            className="text-left py-2 font-sans text-base text-[#9AA7BD] hover:text-[#EAF0FA] border-b border-[rgba(148,170,210,0.1)]"
          >
            Engines
          </button>
          <a
            href="https://github.com/rajivthakker/sentinel-chain/blob/main/docs/benchmarks.md"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 font-sans text-base text-[#9AA7BD] hover:text-[#EAF0FA] border-b border-[rgba(148,170,210,0.1)]"
          >
            Benchmarks
          </a>
          <a
            href="https://github.com/rajivthakker/sentinel-chain/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 font-sans text-base text-[#9AA7BD] hover:text-[#EAF0FA] border-b border-[rgba(148,170,210,0.1)]"
          >
            Docs
          </a>
          <a
            href="https://github.com/rajivthakker/sentinel-chain"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 font-sans text-base text-[#9AA7BD] hover:text-[#EAF0FA] border-b border-[rgba(148,170,210,0.1)]"
          >
            GitHub
          </a>
          <button
            onClick={() => scrollTo('scanner')}
            className="mt-2 w-full py-3 rounded-xl bg-gradient-to-b from-[#FFC766] to-[#FF9F2E] text-[#1A1206] font-semibold text-center"
          >
            Launch Scanner
          </button>
        </div>
      )}
    </nav>
  );
}
