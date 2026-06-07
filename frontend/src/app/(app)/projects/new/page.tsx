"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import type { Platform } from "@/lib/types";

const PLATFORMS: Array<{ value: Platform; label: string; enabled: boolean }> = [
  { value: "Web", label: "Web", enabled: true },
  { value: "Mobile", label: "Mobile", enabled: true },
  { value: "Responsive", label: "반응형", enabled: false },
  { value: "APP", label: "APP", enabled: false },
];

export default function NewProjectPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const create = useProjectStore((s) => s.create);
  const [name, setName] = useState("");
  const [requirements, setRequirements] = useState("");
  const [platform, setPlatform] = useState<Platform>("Web");
  const [conceptCount, setConceptCount] = useState<1 | 2 | 3>(
    user?.plan === "Free" ? 1 : 3,
  );
  const [variantCount, setVariantCount] = useState<3 | 5>(
    user?.plan === "Free" ? 3 : 5,
  );
  const [files, setFiles] = useState<File[]>([]);
  const isFree = user?.plan === "Free";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !requirements.trim()) return;
    const project = create({
      name: name.trim(),
      requirementsText: requirements.trim(),
      platform,
    });
    router.push(`/projects/new/generating?projectId=${project.id}`);
  };

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list).slice(0, 5));
  };

  const expectedCredit =
    (conceptCount * variantCount) / 5; // 5종 시안 = 1 크레딧 단위

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="새 프로젝트"
        description="요건사항을 입력하면 AI 가 DS 와 시안을 자동 생성한다."
        breadcrumb={
          <>
            <span>대시보드</span>
            <span className="px-1.5">/</span>
            <span className="text-ink-700">새 프로젝트</span>
          </>
        }
      />

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Card>
          <Input
            id="name"
            label="프로젝트명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 투자자 미팅용 SaaS 대시보드"
            required
            maxLength={200}
          />
        </Card>

        <Card>
          <Textarea
            id="requirements"
            label="요건사항"
            hint="기획 의도·톤·핵심 화면을 자유롭게 적는다. Markdown 일부 지원."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            countMax={10000}
            maxLength={10000}
            placeholder={`예시:\n\nB2B SaaS 분석 대시보드. 좌측 사이드바, 상단 지표 카드 4개, 시계열 차트 2개. 톤은 차분하고 신뢰감 있게.`}
            required
          />
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">
            파일 첨부 (선택)
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            .md·.png·.jpg·.pdf — 이미지 20MB·문서 10MB, 최대 5개
          </p>
          <label
            htmlFor="file-input"
            className="mt-3 flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink-200 bg-ink-50/50 text-center text-xs text-ink-500 hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="text-base">📎</span>
            <span className="mt-1">파일을 드래그하거나 클릭하여 업로드</span>
            <input
              id="file-input"
              type="file"
              multiple
              accept=".md,.png,.jpg,.jpeg,.pdf"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-ink-700">{f.name}</span>
                  <span className="shrink-0 text-[10px] text-ink-400">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">플랫폼</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                disabled={!p.enabled}
                onClick={() => setPlatform(p.value)}
                className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  platform === p.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {p.label}
                {!p.enabled && (
                  <div className="mt-0.5 text-[9px] font-normal text-ink-400">
                    v2.0 예정
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-700">
                  컨셉 수
                </span>
                {isFree && <Badge tone="warning">Free: 1종 고정</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isFree && n !== 1}
                    onClick={() => setConceptCount(n as 1 | 2 | 3)}
                    className={`rounded-lg border py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      conceptCount === n
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {n}종
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-700">
                  컨셉당 시안 수
                </span>
                {isFree && <Badge tone="warning">Free: 3종 고정</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[3, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isFree && n !== 3}
                    onClick={() => setVariantCount(n as 3 | 5)}
                    className={`rounded-lg border py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      variantCount === n
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {n}종
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-6 mt-6 border-t border-ink-200 bg-white/90 px-6 py-4 backdrop-blur md:mx-0 md:rounded-xl md:border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ink-500">
              총 {conceptCount * variantCount}종 시안 · 예상 소요 2~3분 · 차감
              크레딧 약 {expectedCredit.toFixed(0)}회
            </div>
            <Button type="submit" size="lg" disabled={!name || !requirements}>
              생성 시작
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
