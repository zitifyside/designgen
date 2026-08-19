import { AuthBrand } from "@/components/i18n/AuthBrand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 to-brand-50 p-6">
      <div className="w-full max-w-sm">
        <AuthBrand />
        {children}
      </div>
    </div>
  );
}
