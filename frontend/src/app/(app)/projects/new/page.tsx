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

interface ConceptDraft {
  name: string;
  direction: string;
  keywords: string;
}

const EMPTY_CONCEPT: ConceptDraft = { name: "", direction: "", keywords: "" };

const CONCEPT_PLACEHOLDERS: ConceptDraft[] = [
  {
    name: "Modern Minimal",
    direction: "낮은 채도·넓은 여백·중성 컬러 중심. 차분하고 신뢰감 있는 무드.",
    keywords: "minimal, neutral, calm, trustworthy",
  },
  {
    name: "Bold Vibrant",
    direction: "강한 채도·굵은 타이포·진한 그림자. 임팩트 있는 첫인상.",
    keywords: "bold, vibrant, impactful, expressive",
  },
  {
    name: "Soft Pastel",
    direction: "파스텔 컬러·둥근 모서리·따뜻한 무드. 친근하고 부드럽게.",
    keywords: "pastel, warm, rounded, friendly",
  },
];

type ConceptMode = "auto" | "manual";

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
  const [conceptMode, setConceptMode] = useState<ConceptMode>("auto");
  const [concepts, setConcepts] = useState<ConceptDraft[]>([
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
  ]);
  const isFree = user?.plan === "Free";

  const updateConcept = (idx: number, patch: Partial<ConceptDraft>) => {
    setConcepts((arr) =>
      arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const applyPlaceholder = (idx: number) =>
    updateConcept(idx, CONCEPT_PLACEHOLDERS[idx % 3]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !requirements.trim()) return;
    if (conceptMode === "manual") {
      const active = concepts.slice(0, conceptCount);
      const incomplete = active.some(
        (c) => !c.name.trim() || !c.direction.trim(),
      );
      if (incomplete) {
        alert(
          `직접 입력 모드는 컨셉 ${conceptCount}개의 이름·방향성이 모두 채워져야 한다.`,
        );
        return;
      }
    }
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

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-ink-700">컨셉 정의</div>
              <p className="mt-0.5 text-[11px] text-ink-500">
                AI 가 알아서 추출하게 두거나, 직접 컨셉의 방향성을 지정한다.
              </p>
            </div>
            <div className="inline-flex gap-1 rounded-lg bg-ink-100 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setConceptMode("auto")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  conceptMode === "auto"
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                AI 자동
              </button>
              <button
                type="button"
                onClick={() => setConceptMode("manual")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  conceptMode === "manual"
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                직접 입력
              </button>
            </div>
          </div>

          {conceptMode === "auto" ? (
            <div className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-600">
              AI 가 요건 텍스트를 분석해 {conceptCount}종 컨셉의 이름·방향성·
              색감을 자동 추출한다. 결과는 작업 화면에서 언제든 수정 가능하다.
            </div>
          ) : (
            <div className="space-y-3">
              {concepts.slice(0, conceptCount).map((c, idx) => {
                const label = String.fromCharCode(65 + idx); // A·B·C
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-ink-200 bg-white p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
                          {label}
                        </span>
                        <span className="text-xs font-medium text-ink-700">
                          컨셉 {label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPlaceholder(idx)}
                        className="text-[10px] text-brand-600 hover:underline"
                      >
                        예시로 채우기
                      </button>
                    </div>
                    <Input
                      label="컨셉 이름"
                      placeholder="예: Modern Minimal"
                      value={c.name}
                      onChange={(e) => updateConcept(idx, { name: e.target.value })}
                      maxLength={60}
                    />
                    <div className="mt-2">
                      <Textarea
                        label="방향성·무드"
                        placeholder="이 컨셉이 추구하는 시각적 무드·감정·핵심 가치를 한두 문장으로 적는다."
                        value={c.direction}
                        onChange={(e) =>
                          updateConcept(idx, { direction: e.target.value })
                        }
                        rows={2}
                        countMax={400}
                        maxLength={400}
                      />
                    </div>
                    <div className="mt-2">
                      <Input
                        label="키워드 (선택)"
                        placeholder="쉼표로 구분 · 예: minimal, calm, neutral"
                        value={c.keywords}
                        onChange={(e) =>
                          updateConcept(idx, { keywords: e.target.value })
                        }
                        maxLength={120}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-ink-400">
                직접 입력 모드에서는 활성 컨셉 {conceptCount}개의 이름·방향성이
                모두 채워져야 생성을 시작할 수 있다.
              </p>
            </div>
          )}
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
