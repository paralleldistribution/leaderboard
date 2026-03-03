import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'

// ─── Constants ───────────────────────────────────────────────

const DATE_RANGES = [
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: 'MTD', label: 'MTD' },
  { key: '3M', label: '3M' },
  { key: '1Y', label: '1Y' },
  { key: 'custom', label: 'Custom' },
]

const PAGE_SIZE = 1000

// ─── Helpers ─────────────────────────────────────────────────

function getDateRange(key) {
  const now = new Date()
  const start = new Date()

  switch (key) {
    case '1W':
      start.setDate(now.getDate() - 7)
      break
    case '1M':
      start.setDate(now.getDate() - 30)
      break
    case 'MTD':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case '3M':
      start.setMonth(now.getMonth() - 3)
      break
    case '1Y':
      start.setFullYear(now.getFullYear() - 1)
      break
    default:
      start.setDate(now.getDate() - 7)
  }

  return { start: start.toISOString(), end: now.toISOString() }
}

async function fetchAllRows(table, columns, startDate, endDate, filters = []) {
  let allData = []
  let from = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(columns)
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    for (const f of filters) {
      query = query.ilike(f.column, f.value)
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    allData = allData.concat(data || [])
    hasMore = (data || []).length === PAGE_SIZE
    from += PAGE_SIZE
  }

  return allData
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Animated Number Component ───────────────────────────────

function AnimatedNumber({ value, duration = 800 }) {
  const [displayed, setDisplayed] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) {
      setDisplayed(to)
      return
    }

    const startTime = performance.now()
    let raf

    function update(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        raf = requestAnimationFrame(update)
      } else {
        prevRef.current = to
      }
    }

    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return formatNumber(displayed)
}

// ─── Skeleton Row ────────────────────────────────────────────

function SkeletonRow({ index }) {
  return (
    <div
      className="flex items-center gap-4 px-4 sm:px-6 py-4 border-b border-surface-border"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="skeleton w-8 h-8 rounded-full shrink-0" />
      <div className="skeleton h-4 rounded flex-1 max-w-[180px]" />
      <div className="skeleton h-4 rounded w-16 ml-auto" />
      <div className="skeleton h-4 rounded w-16 hidden sm:block" />
      <div className="skeleton h-4 rounded w-14 hidden sm:block" />
    </div>
  )
}

// ─── Expanded Domain Details ─────────────────────────────────

function ExpandedDetails({ details, dateRange }) {
  // Platform breakdown
  const platformCounts = useMemo(() => {
    const counts = { android: 0, ios: 0, other: 0 }
    details.forEach((d) => {
      const p = (d.platform || '').toLowerCase()
      if (p === 'android') counts.android++
      else if (p === 'ios') counts.ios++
      else counts.other++
    })
    return counts
  }, [details])

  const totalInstalls = details.length
  const androidPct = totalInstalls > 0 ? (platformCounts.android / totalInstalls) * 100 : 0
  const iosPct = totalInstalls > 0 ? (platformCounts.ios / totalInstalls) * 100 : 0

  // Top countries
  const topCountries = useMemo(() => {
    const map = {}
    details.forEach((d) => {
      const c = d.country || 'Unknown'
      map[c] = (map[c] || 0) + 1
    })
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    const maxCount = top.length > 0 ? top[0][1] : 1
    return top.map(([country, count]) => ({ country, count, pct: (count / maxCount) * 100 }))
  }, [details])

  // Recent installs (last 10)
  const recentInstalls = useMemo(() => {
    return [...details]
      .sort((a, b) => new Date(b.install_time || b.created_at) - new Date(a.install_time || a.created_at))
      .slice(0, 10)
  }, [details])

  // Daily average
  const dailyAvg = useMemo(() => {
    if (!dateRange || totalInstalls === 0) return '0'
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
    return (totalInstalls / days).toFixed(1)
  }, [dateRange, totalInstalls])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 sm:p-6">
      {/* Platform Split */}
      <div className="bg-surface rounded-xl border border-surface-border p-4">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Platform Split</h4>
        <div className="flex gap-6 mb-3">
          <div>
            <span className="text-lg font-bold">{platformCounts.android}</span>
            <span className="text-xs text-muted ml-1.5">Android</span>
          </div>
          <div>
            <span className="text-lg font-bold">{platformCounts.ios}</span>
            <span className="text-xs text-muted ml-1.5">iOS</span>
          </div>
          {platformCounts.other > 0 && (
            <div>
              <span className="text-lg font-bold">{platformCounts.other}</span>
              <span className="text-xs text-muted ml-1.5">Other</span>
            </div>
          )}
        </div>
        <div className="h-3 rounded-full bg-surface-overlay overflow-hidden flex">
          {androidPct > 0 && (
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${androidPct}%` }}
            />
          )}
          {iosPct > 0 && (
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${iosPct}%` }}
            />
          )}
        </div>
        <div className="flex gap-4 mt-2 text-[10px] text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Android {androidPct.toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />iOS {iosPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Top Countries */}
      <div className="bg-surface rounded-xl border border-surface-border p-4">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Top Countries</h4>
        {topCountries.length === 0 ? (
          <p className="text-muted text-xs">No country data</p>
        ) : (
          <div className="space-y-2">
            {topCountries.map(({ country, count, pct }) => (
              <div key={country} className="flex items-center gap-2">
                <span className="text-xs w-16 truncate font-medium">{country}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted tabular-nums w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Installs */}
      <div className="bg-surface rounded-xl border border-surface-border p-4">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Recent Installs</h4>
        {recentInstalls.length === 0 ? (
          <p className="text-muted text-xs">No installs found</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recentInstalls.map((inst, idx) => {
              const t = inst.install_time || inst.created_at
              return (
                <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-surface-border/50 last:border-0">
                  <span className="text-muted">{formatDate(t)} {formatTime(t)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      (inst.platform || '').toLowerCase() === 'ios'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-green-500/10 text-green-400'
                    }`}>
                      {(inst.platform || 'N/A')}
                    </span>
                    <span className="text-muted w-12 text-right truncate">{inst.country || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Daily Average */}
      <div className="bg-surface rounded-xl border border-surface-border p-4 flex flex-col items-center justify-center">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Daily Average</h4>
        <p className="text-4xl font-extrabold text-accent">{dailyAvg}</p>
        <p className="text-xs text-muted mt-1">installs / day</p>
      </div>
    </div>
  )
}

// ─── Chevron Icon ────────────────────────────────────────────

function ChevronDown({ expanded }) {
  return (
    <svg
      className={`w-4 h-4 text-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// ─── Main App ────────────────────────────────────────────────

export default function App() {
  const [activeRange, setActiveRange] = useState('1W')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [clicks, setClicks] = useState([])
  const [conversions, setConversions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedDomain, setExpandedDomain] = useState(null)
  const [currentDateRange, setCurrentDateRange] = useState(null)

  // Fetch data on range change
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    let dateRange
    if (activeRange === 'custom') {
      if (!customStart || !customEnd) {
        setLoading(false)
        return
      }
      dateRange = {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd + 'T23:59:59.999Z').toISOString(),
      }
    } else {
      dateRange = getDateRange(activeRange)
    }

    setCurrentDateRange(dateRange)

    try {
      const [clickData, convData] = await Promise.all([
        fetchAllRows('clicks', 'bridge_domain', dateRange.start, dateRange.end),
        fetchAllRows(
          'conversions',
          'campaign_name,platform,install_time,country',
          dateRange.start,
          dateRange.end,
          [{ column: 'event_name', value: '%install%' }]
        ),
      ])
      setClicks(clickData)
      setConversions(convData)
      setExpandedDomain(null)
    } catch (err) {
      console.error(err)
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [activeRange, customStart, customEnd])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Aggregate into leaderboard
  const leaderboardData = useMemo(() => {
    const clickMap = {}
    const convMap = {}
    const detailsMap = {}

    clicks.forEach((c) => {
      const d = c.bridge_domain
      if (d) clickMap[d] = (clickMap[d] || 0) + 1
    })

    conversions.forEach((c) => {
      const d = c.campaign_name
      if (d) {
        convMap[d] = (convMap[d] || 0) + 1
        if (!detailsMap[d]) detailsMap[d] = []
        detailsMap[d].push(c)
      }
    })

    const domains = new Set([...Object.keys(clickMap), ...Object.keys(convMap)])

    return Array.from(domains)
      .map((domain) => {
        const cl = clickMap[domain] || 0
        const cv = convMap[domain] || 0
        return {
          domain,
          clicks: cl,
          conversions: cv,
          rate: cl > 0 ? ((cv / cl) * 100).toFixed(1) : '0.0',
          details: detailsMap[domain] || [],
        }
      })
      .sort((a, b) => b.conversions - a.conversions)
  }, [clicks, conversions])

  // Summary stats
  const totalClicks = useMemo(
    () => leaderboardData.reduce((s, r) => s + r.clicks, 0),
    [leaderboardData]
  )
  const totalInstalls = useMemo(
    () => leaderboardData.reduce((s, r) => s + r.conversions, 0),
    [leaderboardData]
  )
  const avgRate = useMemo(
    () =>
      totalClicks > 0 ? ((totalInstalls / totalClicks) * 100).toFixed(1) : '0.0',
    [totalClicks, totalInstalls]
  )

  function getRankStyle(rank) {
    if (rank === 1) return 'rank-gold'
    if (rank === 2) return 'rank-silver'
    if (rank === 3) return 'rank-bronze'
    return 'bg-surface-overlay text-muted'
  }

  function toggleExpand(domain) {
    setExpandedDomain((prev) => (prev === domain ? null : domain))
  }

  return (
    <div className="min-h-screen bg-surface px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto">
        {/* ── Header ── */}
        <div className="opacity-0 animate-fade-up mb-8 sm:mb-10">
          <div className="flex items-center gap-3 mb-4">
            <img src="/parallel_new_logo.svg" alt="Parallel Distribution" className="h-8 w-8" />
            <span className="text-sm font-semibold text-muted tracking-wide uppercase">Parallel Distribution</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Leaderboard
            </h1>
            <span className="flex items-center gap-1.5 text-xs font-medium text-positive bg-positive/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-positive rounded-full animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-muted text-sm sm:text-base">
            Domain performance ranked by installs
          </p>
        </div>

        {/* ── Date Selector ── */}
        <div
          className="opacity-0 animate-fade-up mb-6"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {DATE_RANGES.map((range) => (
              <button
                key={range.key}
                onClick={() => setActiveRange(range.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeRange === range.key
                    ? 'bg-accent text-white shadow-lg shadow-accent/20'
                    : 'bg-surface-raised text-muted border border-surface-border hover:text-white hover:border-accent/40'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          <div
            className={`grid grid-cols-2 gap-3 mt-3 transition-all duration-300 origin-top ${
              activeRange === 'custom'
                ? 'max-h-20 opacity-100 scale-y-100'
                : 'max-h-0 opacity-0 scale-y-0 overflow-hidden'
            }`}
          >
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
              placeholder="Start date"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
              placeholder="End date"
            />
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div
          className="opacity-0 animate-fade-up grid grid-cols-3 gap-3 sm:gap-4 mb-8"
          style={{ animationDelay: '200ms' }}
        >
          <div className="stat-glow bg-surface-raised border border-surface-border rounded-xl p-4 sm:p-5">
            <p className="text-muted text-xs sm:text-sm font-medium uppercase tracking-wider mb-1">
              Clicks
            </p>
            <p className="text-xl sm:text-2xl font-bold">
              {loading ? (
                <span className="skeleton inline-block w-16 h-7 rounded" />
              ) : (
                <AnimatedNumber value={totalClicks} />
              )}
            </p>
          </div>
          <div className="stat-glow bg-surface-raised border border-surface-border rounded-xl p-4 sm:p-5">
            <p className="text-muted text-xs sm:text-sm font-medium uppercase tracking-wider mb-1">
              Installs
            </p>
            <p className="text-xl sm:text-2xl font-bold text-positive">
              {loading ? (
                <span className="skeleton inline-block w-16 h-7 rounded" />
              ) : (
                <AnimatedNumber value={totalInstalls} />
              )}
            </p>
          </div>
          <div className="stat-glow bg-surface-raised border border-surface-border rounded-xl p-4 sm:p-5">
            <p className="text-muted text-xs sm:text-sm font-medium uppercase tracking-wider mb-1">
              CVR
            </p>
            <p className="text-xl sm:text-2xl font-bold text-accent">
              {loading ? (
                <span className="skeleton inline-block w-16 h-7 rounded" />
              ) : (
                <>{avgRate}%</>
              )}
            </p>
          </div>
        </div>

        {/* ── Leaderboard ── */}
        <div
          className="opacity-0 animate-fade-up bg-surface-raised border border-surface-border rounded-2xl overflow-hidden"
          style={{ animationDelay: '300ms' }}
        >
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[48px_1fr_100px_100px_80px_24px] items-center px-6 py-3 border-b border-surface-border">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              #
            </span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              Domain
            </span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest text-right">
              Clicks
            </span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest text-right">
              Installs
            </span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest text-right">
              CVR
            </span>
            <span />
          </div>

          {/* Loading state */}
          {loading && (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} index={i} />
              ))}
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-red-400 font-medium mb-1">Error</p>
              <p className="text-muted text-sm">{error}</p>
              <button
                onClick={fetchData}
                className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && leaderboardData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-overlay flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">No data yet</p>
              <p className="text-muted text-sm">
                {activeRange === 'custom' && (!customStart || !customEnd)
                  ? 'Select a start and end date above'
                  : 'No installs or clicks found for this period'}
              </p>
            </div>
          )}

          {/* Data rows */}
          {!loading && !error && leaderboardData.length > 0 && (
            <div>
              {leaderboardData.map((row, i) => {
                const rank = i + 1
                const isExpanded = expandedDomain === row.domain
                return (
                  <div
                    key={row.domain}
                    className="opacity-0 animate-fade-up"
                    style={{ animationDelay: `${350 + i * 50}ms` }}
                  >
                    {/* ── Desktop Row ── */}
                    <div
                      onClick={() => toggleExpand(row.domain)}
                      className={`hidden sm:grid grid-cols-[48px_1fr_100px_100px_80px_24px] items-center px-6 py-3.5 border-b border-surface-border row-glow transition-all duration-200 hover:bg-surface-overlay/50 cursor-pointer select-none ${
                        isExpanded ? 'bg-surface-overlay/30' : ''
                      }`}
                    >
                      <div className="flex items-center">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${getRankStyle(
                            rank
                          )}`}
                        >
                          {rank}
                        </span>
                      </div>
                      <span className="font-medium text-sm truncate pr-4">
                        {row.domain}
                      </span>
                      <span className="text-sm text-muted text-right tabular-nums">
                        <AnimatedNumber value={row.clicks} />
                      </span>
                      <span className="text-sm font-semibold text-positive text-right tabular-nums">
                        <AnimatedNumber value={row.conversions} />
                      </span>
                      <span className="text-sm text-accent text-right tabular-nums">
                        {row.rate}%
                      </span>
                      <div className="flex justify-end">
                        <ChevronDown expanded={isExpanded} />
                      </div>
                    </div>

                    {/* ── Desktop Expanded Panel ── */}
                    <div
                      className={`hidden sm:block overflow-hidden transition-all duration-300 ease-in-out border-b border-surface-border bg-surface-raised/50 ${
                        isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {isExpanded && (
                        <ExpandedDetails details={row.details} dateRange={currentDateRange} />
                      )}
                    </div>

                    {/* ── Mobile Card ── */}
                    <div
                      className="sm:hidden leaderboard-row cursor-pointer"
                      onClick={() => toggleExpand(row.domain)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getRankStyle(
                            rank
                          )}`}
                        >
                          {rank}
                        </span>
                        <span className="font-semibold text-sm truncate flex-1">
                          {row.domain}
                        </span>
                        <ChevronDown expanded={isExpanded} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-surface/60 rounded-lg px-3 py-2 text-center">
                          <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-0.5">
                            Clicks
                          </p>
                          <p className="text-sm font-bold tabular-nums">
                            <AnimatedNumber value={row.clicks} />
                          </p>
                        </div>
                        <div className="bg-surface/60 rounded-lg px-3 py-2 text-center">
                          <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-0.5">
                            Installs
                          </p>
                          <p className="text-sm font-bold text-positive tabular-nums">
                            <AnimatedNumber value={row.conversions} />
                          </p>
                        </div>
                        <div className="bg-surface/60 rounded-lg px-3 py-2 text-center">
                          <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-0.5">
                            CVR
                          </p>
                          <p className="text-sm font-bold text-accent tabular-nums">
                            {row.rate}%
                          </p>
                        </div>
                      </div>

                      {/* ── Mobile Expanded Panel ── */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {isExpanded && (
                          <ExpandedDetails details={row.details} dateRange={currentDateRange} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && leaderboardData.length > 0 && (
          <p
            className="opacity-0 animate-fade-up text-center text-muted text-xs mt-4"
            style={{ animationDelay: `${400 + leaderboardData.length * 50}ms` }}
          >
            {leaderboardData.length} domain{leaderboardData.length !== 1 && 's'}{' '}
            &middot; Updated just now
          </p>
        )}
      </div>
    </div>
  )
}
