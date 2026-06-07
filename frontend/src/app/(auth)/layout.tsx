export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 to-brand-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            DG
          </div>
          <div>
            <div className="text-base font-semibold text-ink-900">
              AI Design Generator
            </div>
            <div className="text-xs text-ink-500">
              DS 3종 · 시안 15종 자동 생성
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
