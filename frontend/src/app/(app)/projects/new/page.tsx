"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import type { ConceptBrief, DsMode, Platform, Project } from "@/lib/types";

const PLATFORMS: Array<{ value: Platform; label: string; enabled: boolean }> = [
  { value: "Web", label: "Web", enabled: true },
  { value: "Mobile", label: "Mobile", enabled: true },
  { value: "Responsive", label: "반응형", enabled: false },
  { value: "APP", label: "APP", enabled: false },
];

/** 대표 장면 프리셋 — 빈 값은 'AI 자동 선택', 기본은 메인 컨셉 보드. */
const SCREEN_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "AI 자동 선택" },
  { value: "main", label: "메인" },
  { value: "landing", label: "랜딩" },
  { value: "login", label: "로그인" },
  { value: "dashboard", label: "대시보드" },
  { value: "list", label: "목록" },
  { value: "detail", label: "상세" },
];

const EMPTY_CONCEPT: ConceptBrief = { name: "", direction: "", keywords: "" };

const CONCEPT_PLACEHOLDERS: ConceptBrief[] = [
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

/**
 * 요건 입력 자동 저장 (기능정의서 v0.2.0 §3.1 '자동 저장').
 * 30초마다 브라우저에 보관하고, 재진입 시 복원한다. 서버에 빈 Draft 프로젝트를
 * 만들지 않는 이유는 생성 전 이탈이 훨씬 잦아 껍데기 프로젝트만 쌓이기 때문이다.
 */
const DRAFT_KEY = "adg.newProject.draft.v1";
const DRAFT_INTERVAL_MS = 30_000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UNTITLED_PROJECT = "제목 없음";

interface Draft {
  savedAt: number;
  projectId?: string | null;
  name: string;
  requirements: string;
  platform: Platform;
  conceptCount: 1 | 2 | 3;
  variantCount: 3 | 5;
  dsMode: DsMode;
  screenPreset: string;
  customScreen: string;
  conceptMode: ConceptMode;
  concepts: ConceptBrief[];
}

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function persistDraft(current: Omit<Draft, "savedAt">): Date | null {
  if (typeof window === "undefined") return null;
  const savedAt = Date.now();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...current, savedAt }));
  return new Date(savedAt);
}

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const create = useProjectStore((s) => s.create);
  const update = useProjectStore((s) => s.update);

  const isFree = user?.plan === "Free" || user?.plan === undefined;
  const canUnifiedDs = user?.plan === "Pro" || user?.plan === "Team" || user?.plan === "Admin";

  const [name, setName] = useState("");
  const [requirements, setRequirements] = useState("");
  const [platform, setPlatform] = useState<Platform>("Web");
  // v2.0 예정 플랫폼은 고를 수 없다. 대신 출시 알림을 신청받는다
  // (기능정의서 §3.1 '플랫폼 선택 — 클릭 시 출시 알림 신청 폼').
  const [notifyPlatform, setNotifyPlatform] = useState<Platform | null>(null);
  const [notifyDone, setNotifyDone] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [conceptCount, setConceptCount] = useState<1 | 2 | 3>(isFree ? 1 : 3);
  const [variantCount, setVariantCount] = useState<3 | 5>(isFree ? 3 : 5);
  const [dsMode, setDsMode] = useState<DsMode>("per_concept");
  const [screenPreset, setScreenPreset] = useState<string>("main");
  const [customScreen, setCustomScreen] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [conceptMode, setConceptMode] = useState<ConceptMode>("auto");
  const [concepts, setConcepts] = useState<ConceptBrief[]>([
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState<Date | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const stateRef = useRef<Record<string, unknown>>({});

  // 현재 입력값을 ref 에 담아 두어, 저장 타이머가 매번 재생성되지 않게 한다.
  stateRef.current = {
    projectId: draftId,
    name, requirements, platform, conceptCount, variantCount,
    dsMode, screenPreset, customScreen, conceptMode, concepts,
  };
  draftIdRef.current = draftId;

  const applyLocalDraft = (draft: Draft) => {
    setName(draft.name === UNTITLED_PROJECT ? "" : (draft.name ?? ""));
    setRequirements(draft.requirements ?? "");
    setPlatform(draft.platform ?? "Web");
    setConceptCount(draft.conceptCount ?? 1);
    setVariantCount(draft.variantCount ?? 3);
    setDsMode(draft.dsMode ?? "per_concept");
    setScreenPreset(draft.screenPreset ?? "main");
    setCustomScreen(draft.customScreen ?? "");
    setConceptMode(draft.conceptMode ?? "auto");
    if (Array.isArray(draft.concepts) && draft.concepts.length === 3) {
      setConcepts(draft.concepts);
    }
    if (draft.projectId) {
      setDraftId(draft.projectId);
      draftIdRef.current = draft.projectId;
    }
    setDraftRestored(new Date(draft.savedAt));
  };

  const applyServerProject = (project: Project) => {
    const known = new Set(["main", "landing", "login", "dashboard", "list", "detail"]);
    const screen = project.targetScreen || "";
    setName(project.name === UNTITLED_PROJECT ? "" : project.name);
    setRequirements(project.requirementsText ?? "");
    setPlatform(project.platform ?? "Web");
    setConceptCount((project.conceptCount as 1 | 2 | 3) || 1);
    setVariantCount((project.variantCount as 3 | 5) || 3);
    setDsMode(project.dsMode ?? "per_concept");
    if (!screen) {
      setScreenPreset("");
      setCustomScreen("");
    } else if (known.has(screen)) {
      setScreenPreset(screen);
      setCustomScreen("");
    } else {
      setScreenPreset("custom");
      setCustomScreen(screen);
    }
    const briefs = project.conceptBriefs ?? [];
    const filled = briefs.some((b) => b.name.trim() || b.direction.trim());
    setConceptMode(filled ? "manual" : "auto");
    setConcepts([
      briefs[0] ?? { ...EMPTY_CONCEPT },
      briefs[1] ?? { ...EMPTY_CONCEPT },
      briefs[2] ?? { ...EMPTY_CONCEPT },
    ]);
    setDraftId(project.id);
    draftIdRef.current = project.id;
    setDraftRestored(new Date(project.updatedAt));
  };

  // 재진입 시 복원 (한 번만). URL 의 draft id 가 있으면 서버 값을 우선한다.
  useEffect(() => {
    const fromUrl = searchParams.get("draft");
    if (fromUrl) {
      void api.projects
        .get(fromUrl)
        .then((project) => {
          if (project.status !== "Draft") {
            router.replace(`/projects/${project.id}`);
            return;
          }
          applyServerProject(project);
        })
        .catch(() => {
          setError("임시저장 프로젝트를 불러오지 못했다.");
        });
      return;
    }
    const draft = readDraft();
    if (draft) applyLocalDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshotDraft = (): Omit<Draft, "savedAt"> =>
    stateRef.current as unknown as Omit<Draft, "savedAt">;

  const saveDraftNow = (): boolean => {
    try {
      const saved = persistDraft(snapshotDraft());
      if (saved) setDraftSavedAt(saved);
      return saved !== null;
    } catch {
      return false;
    }
  };

  // 30초마다 자동 저장 — 입력이 없으면 저장하지 않는다.
  // 수동 임시저장은 빈 값도 그대로 남긴다 (필수값과 무관).
  useEffect(() => {
    const timer = setInterval(() => {
      const current = snapshotDraft();
      if (!current.name?.trim() && !current.requirements?.trim()) return;
      saveDraftNow();
    }, DRAFT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const targetScreenValue = () =>
    screenPreset === "custom" ? customScreen.trim() : screenPreset;

  const buildProjectPayload = () => {
    const briefs =
      conceptMode === "manual" ? concepts.slice(0, conceptCount) : undefined;
    return {
      name: name.trim() || UNTITLED_PROJECT,
      requirementsText: requirements,
      platform,
      conceptCount,
      variantCount,
      dsMode,
      targetScreen: targetScreenValue() || undefined,
      conceptBriefs: briefs,
    };
  };

  const handleDraftSave = async () => {
    setError(null);
    setDrafting(true);
    try {
      const payload = buildProjectPayload();
      const existing = draftIdRef.current;
      const project = existing
        ? await update(existing, payload)
        : await create(payload);
      setDraftId(project.id);
      draftIdRef.current = project.id;
      persistDraft({ ...snapshotDraft(), projectId: project.id });
      setDraftSavedAt(new Date());
      setDraftRestored(null);
      if (!existing) {
        router.replace(`/projects/new?draft=${encodeURIComponent(project.id)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "임시저장에 실패했다.");
    } finally {
      setDrafting(false);
    }
  };

  const updateConcept = (idx: number, patch: Partial<ConceptBrief>) => {
    setConcepts((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const applyPlaceholder = (idx: number) =>
    updateConcept(idx, CONCEPT_PLACEHOLDERS[idx % 3]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list).slice(0, 5));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !requirements.trim()) return;

    let briefs: ConceptBrief[] | undefined;
    if (conceptMode === "manual") {
      const active = concepts.slice(0, conceptCount);
      if (active.some((c) => !c.name.trim() || !c.direction.trim())) {
        setError(
          `직접 입력 모드는 컨셉 ${conceptCount}개의 이름·방향성이 모두 채워져야 한다.`,
        );
        return;
      }
      briefs = active;
    }

    const targetScreen = targetScreenValue();

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        requirementsText: requirements.trim(),
        platform,
        conceptCount,
        variantCount,
        dsMode,
        targetScreen: targetScreen || undefined,
        conceptBriefs: briefs,
      };
      const existing = draftIdRef.current;
      const project = existing
        ? await update(existing, payload)
        : await create(payload);
      // 첨부는 프로젝트 생성 직후에 올린다 — 서버가 텍스트를 추출해
      // 요건과 합쳐 분석 입력으로 쓴다.
      if (files.length > 0) {
        await api.files.upload(project.id, files);
      }

      const generation = await api.generations.start(project.id, {
        requirementsText: requirements.trim(),
        concepts: conceptCount,
        variants: variantCount,
        dsMode,
        targetScreen: targetScreen || undefined,
        conceptBriefs: briefs,
      });
      // 생성까지 갔으면 임시 저장본은 역할을 다했다.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* noop */
      }
      void refreshUser();
      router.push(
        `/projects/new/generating?projectId=${project.id}&generationId=${generation.id}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성을 시작하지 못했다.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="콘셉 시안 뽑기"
        description="한 프롬프트로 서로 다른 시각 방향의 시안을 갤러리로 뽑는다. 사이트를 만들지 않는다."
        breadcrumb={
          <>
            <span>대시보드</span>
            <span className="px-1.5">/</span>
            <span className="text-ink-700">새 프로젝트</span>
          </>
        }
      />

      {draftRestored && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
          <span>
            {draftRestored.toLocaleString("ko-KR")} 에 저장된 임시 프로젝트를 불러왔다.
          </span>
          <button
            className="font-medium underline"
            onClick={() => {
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {
                /* noop */
              }
              setName("");
              setRequirements("");
              setCustomScreen("");
              setConcepts([{ ...EMPTY_CONCEPT }, { ...EMPTY_CONCEPT }, { ...EMPTY_CONCEPT }]);
              setDraftId(null);
              draftIdRef.current = null;
              setDraftRestored(null);
              router.replace("/projects/new");
            }}
          >
            새로 작성
          </button>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Card>
          <Input
            id="name"
            label="프로젝트명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 핀테크 브랜드 컨셉"
            required
            maxLength={200}
          />
        </Card>

        <Card>
          <Textarea
            id="requirements"
            label="프롬프트"
            hint="무드·대상·느낌을 한 번에 적는다. 여러 콘셉 시안이 갤러리로 나온다."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            countMax={10000}
            maxLength={10000}
            placeholder={`예시:\n\n투자자 미팅용 핀테크 브랜드. 네이비·골드, 큰 타이포, 여백이 넓은 신뢰감. 대표 장면은 메인 컨셉 보드.`}
            required
          />
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">파일 첨부 (선택)</div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            .md·.txt·.pdf·.png·.jpg — 이미지 20MB·문서 10MB, 최대 5개
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
              accept=".md,.txt,.png,.jpg,.jpeg,.pdf"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-ink-700">{f.name}</span>
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[10px] text-ink-500">
            ※ .md·.txt·.pdf 는 본문 텍스트를 추출해 요건에 합쳐 분석한다. 이미지는
            v1.0 에서 참고 메타만 기록하며 분석에는 쓰이지 않는다.
          </p>
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">플랫폼</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.enabled ? undefined : "출시 알림을 신청한다"}
                onClick={() =>
                  p.enabled ? setPlatform(p.value) : setNotifyPlatform(p.value)
                }
                className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                  !p.enabled
                    ? "border-dashed border-ink-300 bg-ink-50 text-ink-500 hover:border-brand-400 hover:text-ink-700"
                    : platform === p.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                }`}
              >
                {p.label}
                {!p.enabled && (
                  <div className="mt-0.5 text-[9px] font-normal text-ink-500">
                    v2.0 예정 · 알림 신청
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[11px] font-medium text-ink-500 hover:text-ink-800 hover:underline"
        >
          {showAdvanced ? "고급 옵션 접기" : "고급 옵션 (장면·DS·직접 콘셉)"}
        </button>

        {showAdvanced && (
          <Card>
          <div className="text-xs font-medium text-ink-700">
            대표 장면 <span className="font-normal text-ink-500">(선택)</span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            완성 사이트가 아니라, 이 장면의 컨셉 시안을 여러 방향으로 뽑는다.
            미지정 시 AI 가 요건에서 대표 장면을 고른다.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCREEN_PRESETS.map((s) => (
              <button
                key={s.value || "auto"}
                type="button"
                onClick={() => setScreenPreset(s.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  screenPreset === s.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                }`}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setScreenPreset("custom")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                screenPreset === "custom"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
              }`}
            >
              직접 입력
            </button>
          </div>
          {screenPreset === "custom" && (
            <div className="mt-2">
              <Input
                label="화면명"
                placeholder="예: 주문 내역, 온보딩 3단계"
                value={customScreen}
                onChange={(e) => setCustomScreen(e.target.value)}
                maxLength={60}
              />
            </div>
          )}
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-700">콘셉 방향 수</span>
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
                        : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
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
                  방향당 시안 수
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
                        : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {n}종
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {showAdvanced && (
        <>
        <Card>
          <div className="text-xs font-medium text-ink-700">DS 생성 방식</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDsMode("per_concept")}
              className={`rounded-xl border p-3 text-left transition ${
                dsMode === "per_concept"
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-surface hover:bg-ink-50"
              }`}
            >
              <div className="text-xs font-semibold text-ink-900">
                컨셉별 DS 생성
                <span className="ml-1 text-[10px] font-normal text-ink-500">
                  기본값
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                컨셉마다 Color·Typography·Spacing 등 전 카테고리를 독립 생성한다.
                Primary Hue 60도 이상 구별.
              </p>
            </button>

            <button
              type="button"
              disabled={!canUnifiedDs}
              onClick={() => canUnifiedDs && setDsMode("unified")}
              title={
                canUnifiedDs
                  ? undefined
                  : "'단일 DS 통일' 은 Pro 이상 등급에서 선택할 수 있다."
              }
              className={`relative rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                dsMode === "unified"
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-surface hover:bg-ink-50"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                {!canUnifiedDs && <span aria-hidden>🔒</span>}
                단일 DS 통일
                {!canUnifiedDs && <Badge tone="brand">Pro+</Badge>}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                Base Token 1벌을 전 컨셉이 공유하고 강조색만 변주한다.
                Typography·Spacing 은 공통 고정.
              </p>
            </button>
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
                    ? "bg-surface text-ink-900 shadow-sm"
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
                    ? "bg-surface text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                직접 입력
              </button>
            </div>
          </div>

          {conceptMode === "auto" ? (
            <div className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-600">
              AI 가 요건 텍스트를 분석해 {conceptCount}종 컨셉의 이름·방향성·색감을
              자동 추출한다. 결과는 작업 화면에서 언제든 수정 가능하다.
            </div>
          ) : (
            <div className="space-y-3">
              {concepts.slice(0, conceptCount).map((c, idx) => {
                const label = String.fromCharCode(65 + idx); // A·B·C
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-ink-200 bg-surface p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-ink-50">
                          {label}
                        </span>
                        <span className="text-xs font-medium text-ink-700">
                          컨셉 {label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPlaceholder(idx)}
                        className="text-[10px] text-brand-700 hover:underline"
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
              <p className="text-[10px] text-ink-500">
                직접 입력 모드에서는 활성 컨셉 {conceptCount}개의 이름·방향성이 모두
                채워져야 생성을 시작할 수 있다.
              </p>
            </div>
          )}
        </Card>
        </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="sticky bottom-0 -mx-6 mt-6 border-t border-ink-200 bg-surface/90 px-6 py-4 backdrop-blur md:mx-0 md:rounded-xl md:border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-ink-500">
              {draftSavedAt && (
                <span className="mr-2 text-[10px] text-ink-500">
                  저장됨 {draftSavedAt.toLocaleTimeString("ko-KR")}
                </span>
              )}
              컨셉 {conceptCount} × 시안 {variantCount} ={" "}
              {conceptCount * variantCount}종 · 예상 소요 2~3분 · 월간 생성
              한도 <span className="font-medium text-ink-700">1회 차감</span>
              <span className="ml-1 text-[10px] text-ink-500">
                (v1.0 균일제)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                disabled={!name || !requirements}
              >
                생성 시작
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                loading={drafting}
                disabled={submitting}
                onClick={handleDraftSave}
              >
                임시저장
              </Button>
            </div>
          </div>
        </div>
      </form>

      <Modal
        open={notifyPlatform !== null}
        onClose={() => {
          setNotifyPlatform(null);
          setNotifyDone(false);
        }}
        title={notifyDone ? "신청됐다" : "출시 알림 신청"}
        description={
          notifyDone
            ? "출시되면 가입 이메일로 알린다."
            : `${notifyPlatform} 지원은 v2.0 에 예정돼 있다. 준비되면 알려 준다.`
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNotifyPlatform(null);
                setNotifyDone(false);
              }}
            >
              닫기
            </Button>
            {!notifyDone && (
              <Button
                size="sm"
                loading={notifyBusy}
                onClick={async () => {
                  setNotifyBusy(true);
                  try {
                    // 별도 저장소를 만들지 않고 피드백 채널로 모은다 —
                    // 어차피 Admin 이 한곳에서 보는 편이 낫다.
                    await api.system.feedback({
                      category: "feature",
                      title: `[출시 알림] ${notifyPlatform} 플랫폼 지원`,
                      body: `${notifyPlatform} 플랫폼 출시 알림을 신청했다.`,
                    });
                    setNotifyDone(true);
                  } finally {
                    setNotifyBusy(false);
                  }
                }}
              >
                알림 신청
              </Button>
            )}
          </div>
        }
      >
        <p className="text-xs text-ink-600">
          {notifyDone
            ? "같은 신청을 다시 보낼 필요는 없다."
            : "지금은 Web·Mobile 로 생성할 수 있다. 반응형·APP 은 준비 중이다."}
        </p>
      </Modal>
    </div>
  );
}
