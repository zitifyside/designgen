"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/store/auth-store";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError("이용약관·개인정보처리방침 동의가 필요하다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 최소 8자 이상이어야 한다.");
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "회원가입에 실패했다.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
      <h1 className="text-base font-semibold text-ink-900">회원가입</h1>
      <p className="mt-1 text-xs text-ink-500">
        Free 등급으로 시작한다 · 월 3회 생성, Color Token 만 수정 가능.
      </p>

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <Input
          id="name"
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="홍길동"
        />
        <Input
          id="email"
          type="email"
          label="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />
        <Input
          id="password"
          type="password"
          label="비밀번호"
          hint="최소 8자, 영문·숫자·특수문자 1개 이상 권장"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="flex items-start gap-2 pt-1 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-ink-900">이용약관</span> 및{" "}
            <span className="font-medium text-ink-900">개인정보처리방침</span> 에
            동의한다.
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} fullWidth>
          가입하고 시작
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-ink-500">
        이미 계정이 있는가?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
