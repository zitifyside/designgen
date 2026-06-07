"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/store/auth-store";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setLanguage(user.language);
      setTheme(user.theme);
    }
  }, [user]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateProfile({ name, email, language, theme });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader
          title="기본 정보"
          description="팀원·공유 링크 수신자에게 노출된다."
        />
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-semibold text-white">
            {user.name.slice(0, 1)}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink-900">
              {user.name}
            </div>
            <div className="mt-0.5 text-xs text-ink-500">
              {user.email}
              {user.emailVerified ? (
                <Badge tone="success" className="ml-2">
                  검증됨
                </Badge>
              ) : (
                <Badge tone="warning" className="ml-2">
                  미검증
                </Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="brand">{user.plan}</Badge>
              <span className="text-[10px] text-ink-400">
                가입일{" "}
                {new Date(user.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="프로필 수정" />
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="이메일"
            type="email"
            value={email}
            hint="변경 시 재검증 메일이 발송된다"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="언어 및 테마" />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">언어</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { v: "ko" as const, l: "한국어" },
                { v: "en" as const, l: "English" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLanguage(o.v)}
                  className={`rounded-lg border py-2 text-xs font-medium ${
                    language === o.v
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-700">테마</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { v: "light" as const, l: "Light" },
                { v: "dark" as const, l: "Dark" },
                { v: "system" as const, l: "System" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setTheme(o.v)}
                  className={`rounded-lg border py-2 text-xs font-medium ${
                    theme === o.v
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-emerald-600">
          {saved && "✓ 저장되었다"}
        </span>
        <Button type="submit">변경사항 저장</Button>
      </div>
    </form>
  );
}
