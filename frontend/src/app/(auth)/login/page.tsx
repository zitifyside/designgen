"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("demo@designgenerator.io");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "로그인에 실패했다. 잠시 후 다시 시도한다.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
      <h1 className="text-base font-semibold text-ink-900">로그인</h1>
      <p className="mt-1 text-xs text-ink-500">
        Free 등급은 회원가입만으로 즉시 시작 가능하다.
      </p>

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <Input
          id="email"
          type="email"
          label="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          id="password"
          type="password"
          label="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} fullWidth>
          로그인
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[10px] text-ink-400">
        <span className="h-px flex-1 bg-ink-200" />
        OR
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["Google", "Apple", "GitHub"].map((p) => (
          <button
            key={p}
            type="button"
            disabled
            className="rounded-lg border border-ink-200 bg-white py-2 text-xs font-medium text-ink-500 disabled:cursor-not-allowed disabled:opacity-60"
            title={`${p} OAuth — v1.0 출시 시 활성화`}
          >
            {p}
          </button>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-ink-500">
        아직 계정이 없는가? {" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
