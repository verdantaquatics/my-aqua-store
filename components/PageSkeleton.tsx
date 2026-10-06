// Placeholder layouts shown instantly while a page loads (used by loading.tsx files)

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-slate-200/80 ${className}`} />
}

function HeaderSkeleton() {
  return (
    <div className="h-16 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Bar className="h-8 w-36" />
        <div className="hidden gap-6 lg:flex">
          <Bar className="h-4 w-16" />
          <Bar className="h-4 w-24" />
          <Bar className="h-4 w-20" />
          <Bar className="h-4 w-20" />
        </div>
        <Bar className="h-9 w-24" />
      </div>
    </div>
  )
}

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="aspect-square bg-slate-200/70" />
          <div className="space-y-2 p-3 sm:p-4">
            <Bar className="h-3 w-1/3" />
            <Bar className="h-4 w-4/5" />
            <Bar className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StorefrontPageSkeleton() {
  return (
    <div className="flex min-h-screen animate-pulse flex-col" aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      <div className="h-40 bg-slate-800/90 sm:h-56" />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Bar className="h-6 w-48" />
        <ProductGridSkeleton />
      </main>
    </div>
  )
}

export function ProductPageSkeleton() {
  return (
    <div className="flex min-h-screen animate-pulse flex-col" aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      <main className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="aspect-square rounded-2xl bg-slate-200/70" />
        <div className="space-y-4">
          <Bar className="h-4 w-24" />
          <Bar className="h-8 w-4/5" />
          <Bar className="h-7 w-32" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-5/6" />
          <Bar className="h-4 w-2/3" />
          <div className="flex gap-2 pt-2">
            <Bar className="h-10 w-20" />
            <Bar className="h-10 w-20" />
            <Bar className="h-10 w-20" />
          </div>
          <Bar className="h-12 w-full" />
        </div>
      </main>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" />
    </div>
  )
}
