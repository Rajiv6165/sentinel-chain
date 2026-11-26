import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

export default function LivePackageChecker() {
  const [ecosystem, setEcosystem] = useState('npm'); // 'npm' or 'pypi'
  const [packageName, setPackageName] = useState('loadash');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadedPackages, setLoadedPackages] = useState(1988);

  const abortControllerRef = useRef(null);
  const lastRequestTimeRef = useRef(0);
  const debounceTimerRef = useRef(null);

  // Fetch loaded packages count dynamically from /api/health
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && typeof data.loaded_packages === 'number') {
          setLoadedPackages(data.loaded_packages);
        }
      })
      .catch((err) => console.log('Notice: /api/health count fallback used', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const exampleChips = [
    { name: 'loadash', eco: 'npm', label: 'loadash (npm)' },
    { name: 'reqeusts', eco: 'pypi', label: 'reqeusts (PyPI)' },
    { name: 'expresss', eco: 'npm', label: 'expresss (npm)' },
    { name: 'react', eco: 'npm', label: 'react (clean negative)' }
  ];

  const executeCheck = async (pkgToTest, ecoToTest) => {
    const trimmed = (pkgToTest || packageName).trim();
    const eco = ecoToTest || ecosystem;
    if (!trimmed) return;

    setError(null);

    // Rate limit: 1 request per second max
    const now = Date.now();
    const elapsed = now - lastRequestTimeRef.current;
    if (elapsed < 1000) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        executeCheck(trimmed, eco);
      }, 1000 - elapsed);
      return;
    }
    lastRequestTimeRef.current = now;

    // Cancel in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    try {
      let file;
      if (eco === 'npm') {
        const manifest = JSON.stringify({
          name: 'live-package-check',
          dependencies: { [trimmed]: '*' }
        });
        const blob = new Blob([manifest], { type: 'application/json' });
        file = new File([blob], 'package.json', { type: 'application/json' });
      } else {
        const requirements = `${trimmed}==1.0.0\n`;
        const blob = new Blob([requirements], { type: 'text/plain' });
        file = new File([blob], 'requirements.txt', { type: 'text/plain' });
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/scan`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      if (!res.ok) {
        const errorDetail = await extractErrorMessage(res, 'Check failed');
        throw new Error(errorDetail);
      }

      const data = await res.json();
      setResult({
        scannedCount: data.scanned_count,
        findings: data.findings || [],
        checkedPackage: trimmed,
        checkedEco: eco
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to check package');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chip) => {
    setEcosystem(chip.eco);
    setPackageName(chip.name);
    executeCheck(chip.name, chip.eco);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeCheck(packageName, ecosystem);
  };

  return (
    <section
      id="live-checker"
      aria-labelledby="live-checker-heading"
      className="max-w-4xl mx-auto px-6 py-16 scroll-mt-28"
    >
      <div className="rounded-2xl border border-[rgba(148,170,210,0.18)] bg-[rgba(14,22,38,0.78)] backdrop-blur-xl p-6 md:p-8 shadow-xl">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-[rgba(148,170,210,0.12)] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FFB547]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#FFB547] font-semibold">
                INTERACTIVE ENGINE · LIVE LOOKUP
              </span>
            </div>
            <h3
              id="live-checker-heading"
              className="text-2xl font-semibold text-[#EAF0FA] tracking-tight font-sans m-0"
            >
              Live Package Checker
            </h3>
            <p className="text-xs md:text-sm text-[#9AA7BD] font-sans mt-1">
              Test candidate names against {loadedPackages.toLocaleString()} indexed packages with keyboard adjacency and registry heuristics.
            </p>
          </div>

          {/* Ecosystem Segmented Control */}
          <div
            role="group"
            aria-label="Target Ecosystem"
            className="flex p-1 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.16)] self-start md:self-auto"
          >
            <button
              type="button"
              aria-pressed={ecosystem === 'npm'}
              onClick={() => {
                setEcosystem('npm');
                executeCheck(packageName, 'npm');
              }}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                ecosystem === 'npm'
                  ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              npm
            </button>
            <button
              type="button"
              aria-pressed={ecosystem === 'pypi'}
              onClick={() => {
                setEcosystem('pypi');
                executeCheck(packageName, 'pypi');
              }}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                ecosystem === 'pypi'
                  ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              PyPI
            </button>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder={ecosystem === 'npm' ? 'e.g. loadash, expresss' : 'e.g. reqeusts, numpys'}
                aria-label="Package name to verify"
                className="w-full px-4 py-3 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.22)] text-[#EAF0FA] placeholder-[#7A89A3] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#FFB547] focus:border-transparent transition-all"
              />
              {packageName && (
                <button
                  type="button"
                  onClick={() => setPackageName('')}
                  aria-label="Clear package input"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A89A3] hover:text-[#EAF0FA] text-xs font-mono p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !packageName.trim()}
              className="px-6 py-3 rounded-xl font-sans font-semibold text-sm text-[#1A1206] transition-all shadow-md hover:shadow-[#FFB547]/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)'
              }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#1A1206] border-t-transparent rounded-full animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <span>Check Package →</span>
              )}
            </button>
          </div>

          {/* Example Chips */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="font-mono text-[11px] text-[#7A89A3] select-none">
              Try examples:
            </span>
            {exampleChips.map((chip) => (
              <button
                key={chip.name}
                type="button"
                onClick={() => handleChipClick(chip)}
                className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                  packageName === chip.name && ecosystem === chip.eco
                    ? 'border-[#FFB547] text-[#FFB547] bg-[#FFB547]/10'
                    : 'border-[rgba(148,170,210,0.18)] text-[#9AA7BD] hover:text-[#EAF0FA] bg-[#070B14]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </form>

        {/* Live Result Output Container */}
        <div
          aria-live="polite"
          aria-busy={loading}
          className="mt-6 pt-6 border-t border-[rgba(148,170,210,0.12)] min-h-[120px]"
        >
          {error && (
            <div className="p-4 rounded-xl border border-[#FF5A5F]/40 bg-[#FF5A5F]/10 text-[#FF5A5F] text-xs font-mono flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FF5A5F]" />
                <strong>Backend response: </strong> {error}
              </span>
            </div>
          )}

          {!error && !result && !loading && (
            <div className="text-center py-6 text-xs font-mono text-[#7A89A3]">
              Submit a package name or select an example above to execute a live scan.
            </div>
          )}

          {!error && result && (
            <div>
              {result.findings.length > 0 ? (
                <div className="space-y-4">
                  {result.findings.map((f, idx) => {
                    const isInvalid = f.note === 'invalid package name';
                    const isHigh = f.risk_level === 'high' || f.confidence === 'high';
                    const tierLabel = f.confidence_label || f.confidence || (isHigh ? 'high confidence' : 'review');

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl p-5 border text-left ${
                          isInvalid
                            ? 'bg-[#FF5A5F]/10 border-[#FF5A5F]/40'
                            : isHigh
                            ? 'bg-[#FFB547]/10 border-[#FFB547]/40'
                            : 'bg-[rgba(14,22,38,0.7)] border-[rgba(148,170,210,0.2)]'
                        }`}
                      >
                        {/* Status Header */}
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                isInvalid ? 'bg-[#FF5A5F]' : isHigh ? 'bg-[#FFB547] animate-pulse' : 'bg-[#7AA2FF]'
                              }`}
                            />
                            <span className="font-mono text-sm font-bold text-[#EAF0FA]">
                              {f.package_name}
                            </span>
                            <span className="font-mono text-[10px] uppercase text-[#7A89A3] px-1.5 py-0.5 rounded bg-[#070B14]">
                              {f.ecosystem || result.checkedEco}
                            </span>
                          </div>

                          {/* Tier Pill */}
                          <span
                            className={`font-mono text-xs uppercase px-2.5 py-1 rounded-md border font-semibold ${
                              isInvalid
                                ? 'border-[#FF5A5F]/50 text-[#FF5A5F] bg-[#FF5A5F]/15'
                                : isHigh
                                ? 'border-[#FFB547]/50 text-[#FFB547] bg-[#FFB547]/15'
                                : 'border-[#7AA2FF]/50 text-[#7AA2FF] bg-[#7AA2FF]/15'
                            }`}
                          >
                            Tier: {tierLabel}
                          </span>
                        </div>

                        {/* Details Grid */}
                        {!isInvalid && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 my-3 text-xs font-mono">
                            <div className="p-2.5 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)]">
                              <span className="text-[10px] text-[#7A89A3] uppercase block mb-0.5">
                                Nearest Legitimate Package
                              </span>
                              <span className="text-[#4FE3C1] font-bold text-sm">
                                {f.suspected_target || 'N/A'}
                              </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)]">
                              <span className="text-[10px] text-[#7A89A3] uppercase block mb-0.5">
                                Edit Distance
                              </span>
                              <span className="text-[#FFB547] font-bold text-sm">
                                {f.distance_score ?? 'N/A'}
                              </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)] sm:col-span-2 md:col-span-1">
                              <span className="text-[10px] text-[#7A89A3] uppercase block mb-0.5">
                                Confidence Tier
                              </span>
                              <span className="text-[#EAF0FA] font-semibold text-xs capitalize">
                                {tierLabel}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Reasoning Text from Registry */}
                        <div className="mt-3 pt-3 border-t border-[rgba(148,170,210,0.1)] text-xs font-mono text-[#9AA7BD] leading-relaxed">
                          <strong className="text-[#EAF0FA]">Registry Reasoning: </strong>
                          {f.reasoning || f.note || 'No specific registry reasoning returned.'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* No Finding: Clean Negative */
                <div className="rounded-xl p-5 border border-[#4FE3C1]/30 bg-[#4FE3C1]/10 text-left">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#4FE3C1]/20 border border-[#4FE3C1] text-[#4FE3C1] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      ✓
                    </span>
                    <div>
                      <div className="font-mono text-sm font-semibold text-[#4FE3C1] mb-1">
                        Package: {result.checkedPackage} ({result.checkedEco})
                      </div>
                      <p className="font-sans text-sm text-[#EAF0FA] leading-relaxed m-0">
                        Not flagged against {loadedPackages.toLocaleString()} known packages. This does not prove it is safe.
                      </p>
                      <p className="font-sans text-xs text-[#9AA7BD] mt-1.5 m-0">
                        Zero typosquat mutations detected within threshold edit distance. Always check maintainer provenance and transitive manifests.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
