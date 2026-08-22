"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useI18n } from "@/components/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useProjectStore } from "@/store/project-store";
import type { ConceptBrief, DsMode, Platform, Project } from "@/lib/types";

const PLATFORMS: Array<{ value: Platform; label?: string; labelKey?: string; enabled: boolean }> = [
  { value: "Web", label: "Web", enabled: true },
  { value: "Mobile", label: "Mobile", enabled: true },
  { value: "Responsive", labelKey: "projectNew.platformResponsive", enabled: false },
  { value: "APP", label: "APP", enabled: false },
];

/** 대표 장면 프리셋 — 빈 값은 'AI 자동 선택', 기본은 메인 컨셉 보드. */
const SCREEN_PRESETS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "projectNew.sceneAi" },
  { value: "main", labelKey: "projectNew.sceneMain" },
  { value: "landing", labelKey: "projectNew.sceneLanding" },
  { value: "login", labelKey: "projectNew.sceneLogin" },
  { value: "dashboard", labelKey: "projectNew.sceneDashboard" },
  { value: "list", labelKey: "projectNew.sceneList" },
  { value: "detail", labelKey: "projectNew.sceneDetail" },
];

/** 첨부 상한 — 서버(services/upload·url_fetch)와 같은 값이어야 한다. */
const MAX_FILES = 5;
const MAX_LINKS = 5;

const EMPTY_CONCEPT: ConceptBrief = { name: "", direction: "", keywords: "" };

const CONCEPT_PLACEHOLDERS: Array<{ name: string; directionKey: string; keywords: string }> = [
  {
    name: "Modern Minimal",
    directionKey: "projectNew.presetCalmDir",
    keywords: "minimal, neutral, calm, trustworthy",
  },
  {
    name: "Bold Vibrant",
    directionKey: "projectNew.presetBoldDir",
    keywords: "bold, vibrant, impactful, expressive",
  },
  {
    name: "Soft Pastel",
    directionKey: "projectNew.presetWarmDir",
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
  variantCount: 3 | 6;
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
  const { t, locale } = useI18n();
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
  const [variantCount, setVariantCount] = useState<3 | 6>(isFree ? 3 : 6);
  const [dsMode, setDsMode] = useState<DsMode>("per_concept");
  const [screenPreset, setScreenPreset] = useState<string>("main");
  const [customScreen, setCustomScreen] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [conceptMode, setConceptMode] = useState<ConceptMode>("auto");
  const [concepts, setConcepts] = useState<ConceptBrief[]>([
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
    { ...EMPTY_CONCEPT },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // 시안 수·컨셉별 입력이 이 안에 있다. 접어 두면 대부분은 프롬프트 하나만 쓰고
  // 넘어가므로, 이 서비스의 핵심 조종간이 발견되지 않는다. 기본은 펼침이다.
  const [showAdvanced, setShowAdvanced] = useState(true);
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
    setVariantCount((project.variantCount as 3 | 6) || 3);
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
          setError(t("projectNew.loadDraftFailed"));
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
      setError(err instanceof Error ? err.message : t("projectNew.saveDraftFailed"));
    } finally {
      setDrafting(false);
    }
  };

  const updateConcept = (idx: number, patch: Partial<ConceptBrief>) => {
    setConcepts((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const applyPlaceholder = (idx: number) => {
    const ph = CONCEPT_PLACEHOLDERS[idx % 3];
    updateConcept(idx, {
      name: ph.name,
      direction: t(ph.directionKey),
      keywords: ph.keywords,
    });
  };

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_FILES));
  };

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const addLink = () => {
    const value = linkDraft.trim();
    if (!value) return;
    // 형태만 여기서 본다 — 실제 접근 가능 여부·사설망 차단은 서버가 판정한다.
    const candidate = value.includes("://") ? value : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("scheme");
    } catch {
      setLinkError(t("projectNew.linkInvalid"));
      return;
    }
    if (links.includes(candidate)) {
      setLinkError(t("projectNew.linkDuplicate"));
      return;
    }
    if (links.length >= MAX_LINKS) {
      setLinkError(t("projectNew.linkMax", { n: MAX_LINKS }));
      return;
    }
    setLinks((prev) => [...prev, candidate]);
    setLinkDraft("");
    setLinkError(null);
  };

  const removeLink = (index: number) =>
    setLinks((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !requirements.trim()) return;

    let briefs: ConceptBrief[] | undefined;
    if (conceptMode === "manual") {
      const active = concepts.slice(0, conceptCount);
      if (active.some((c) => !c.name.trim() || !c.direction.trim())) {
        setError(
          t("projectNew.conceptFillRequired", { count: conceptCount }),
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
      // URL 은 서버가 직접 가져와야 하므로 한 건씩 보낸다. 한 건이 막혀도
      // (사설 주소·404 등) 나머지와 생성 자체는 그대로 진행한다 — 첨부는
      // 요건을 거드는 재료이지 생성의 전제가 아니다.
      for (const url of links) {
        try {
          await api.files.attachLink(project.id, url);
        } catch (err) {
          console.warn("link attach failed", url, err);
        }
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
      setError(err instanceof Error ? err.message : t("projectNew.startFailed"));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title={t("projectNew.title")}
        description={t("projectNew.description")}
        breadcrumb={
          <>
            <span>{t("projectNew.crumbDashboard")}</span>
            <span className="px-1.5">/</span>
            <span className="text-ink-700">{t("projectNew.crumbNew")}</span>
          </>
        }
      />

      {draftRestored && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
          <span>
            {t("projectNew.draftRestored", { when: draftRestored.toLocaleString(locale === "en" ? "en-US" : "ko-KR") })}
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
            {t("projectNew.writeNew")}
          </button>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Card>
          <Input
            id="name"
            label={t("projectNew.projectName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projectNew.namePlaceholder")}
            required
            maxLength={200}
          />
        </Card>

        <Card>
          <Textarea
            id="requirements"
            label={t("projectNew.prompt")}
            hint={t("projectNew.promptHint")}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            countMax={10000}
            maxLength={10000}
            placeholder={t("projectNew.promptPlaceholder")}
            required
          />
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">{t("projectNew.attachments")}</div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {t("projectNew.attachHint", { f: MAX_FILES })}
          </p>
          <label
            htmlFor="file-input"
            className="mt-3 flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink-200 bg-ink-50/50 text-center text-xs text-ink-500 hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="text-base">📎</span>
            <span className="mt-1">{t("projectNew.dropFiles")}</span>
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
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-ink-700">{f.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-ink-500">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={t("projectNew.attachRemove")}
                    className="shrink-0 rounded px-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[10px] text-ink-500">
            {t("projectNew.attachNote")}
          </p>

          <div className="mt-4 border-t border-ink-200 pt-3">
            <div className="text-xs font-medium text-ink-700">
              {t("projectNew.linkTitle")}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-500">
              {t("projectNew.linkHint")}
            </p>
            <div className="mt-2 flex gap-1.5">
              <input
                type="url"
                inputMode="url"
                value={linkDraft}
                onChange={(e) => {
                  setLinkDraft(e.target.value);
                  setLinkError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // 이 입력은 폼 안에 있다. 막지 않으면 Enter 가 생성 자체를 시작한다.
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder={t("projectNew.linkPlaceholder")}
                className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!linkDraft.trim() || links.length >= MAX_LINKS}
                className="shrink-0 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("projectNew.linkAdd")}
              </button>
            </div>
            {linkError && (
              <p className="mt-1.5 text-[11px] text-danger-600">{linkError}</p>
            )}
            {links.length > 0 && (
              <ul className="mt-2 space-y-1">
                {links.map((url, i) => (
                  <li
                    key={url}
                    className="flex items-center gap-2 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-[11px]">🔗</span>
                    <span className="truncate text-ink-700" title={url}>
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLink(i)}
                      aria-label={t("projectNew.attachRemove")}
                      className="ml-auto shrink-0 rounded px-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-ink-500">
              {t("projectNew.linkNote", { n: MAX_LINKS })}
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-700">{t("projectNew.platform")}</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.enabled ? undefined : t("projectNew.notifyTitle")}
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
                {p.labelKey ? t(p.labelKey) : p.label}
                {!p.enabled && (
                  <div className="mt-0.5 text-[9px] font-normal text-ink-500">
                    {t("projectNew.comingSoon")}
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
{showAdvanced ? t("projectNew.advancedHide") : t("projectNew.advancedShow")}
        </button>

        {showAdvanced && (
          <Card>
          <div className="text-xs font-medium text-ink-700">
            {t("projectNew.heroScene")} <span className="font-normal text-ink-500">{t("projectNew.optional")}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {t("projectNew.heroHint")}
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
                {t(s.labelKey)}
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
              {t("projectNew.customInput")}
            </button>
          </div>
          {screenPreset === "custom" && (
            <div className="mt-2">
              <Input
                label={t("projectNew.screenName")}
                placeholder={t("projectNew.screenPlaceholder")}
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
                <span className="text-xs font-medium text-ink-700">{t("projectNew.conceptCount")}</span>
                {isFree && <Badge tone="warning">{t("projectNew.freeFixed1")}</Badge>}
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
                    {t("projectNew.kindCount", { n })}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-700">
                  {t("projectNew.variantCount")}
                </span>
                {isFree && <Badge tone="warning">{t("projectNew.freeFixed3")}</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[3, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isFree && n !== 3}
                    onClick={() => setVariantCount(n as 3 | 6)}
                    className={`rounded-lg border py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      variantCount === n
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {t("projectNew.kindCount", { n })}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {showAdvanced && (
        <>
        <Card>
          <div className="text-xs font-medium text-ink-700">{t("projectNew.dsMode")}</div>
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
                {t("projectNew.perConcept")}
                <span className="ml-1 text-[10px] font-normal text-ink-500">
                  {t("projectNew.defaultBadge")}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                {t("projectNew.perConceptHint")}
              </p>
            </button>

            <button
              type="button"
              disabled={!canUnifiedDs}
              onClick={() => canUnifiedDs && setDsMode("unified")}
              title={
                canUnifiedDs
                  ? undefined
                  : t("projectNew.unifiedLocked")
              }
              className={`relative rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                dsMode === "unified"
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-surface hover:bg-ink-50"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                {!canUnifiedDs && <span aria-hidden>🔒</span>}
                {t("projectNew.unified")}
                {!canUnifiedDs && <Badge tone="brand">Pro+</Badge>}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                {t("projectNew.unifiedHint")}
              </p>
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-ink-700">{t("projectNew.conceptDef")}</div>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {t("projectNew.conceptDefHint")}
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
                {t("projectNew.aiAuto")}
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
                {t("projectNew.customInput")}
              </button>
            </div>
          </div>

          {conceptMode === "auto" ? (
            <div className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-600">
              {t("projectNew.aiAutoBody", { count: conceptCount })}
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
                          {t("projectNew.conceptN", { label })}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPlaceholder(idx)}
                        className="text-[10px] text-brand-700 hover:underline"
                      >
                        {t("projectNew.fillExample")}
                      </button>
                    </div>
                    <Input
                      label={t("projectNew.conceptName")}
                      placeholder={t("projectNew.conceptNamePh")}
                      value={c.name}
                      onChange={(e) => updateConcept(idx, { name: e.target.value })}
                      maxLength={60}
                    />
                    <div className="mt-2">
                      <Textarea
                        label={t("projectNew.direction")}
                        placeholder={t("projectNew.directionPh")}
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
                        label={t("projectNew.keywords")}
                        placeholder={t("projectNew.keywordsPh")}
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
                {t("projectNew.directFillNote", { count: conceptCount })}
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
                  {t("projectNew.savedAt", { when: draftSavedAt.toLocaleTimeString(locale === "en" ? "en-US" : "ko-KR") })}
                </span>
              )}
              {t("projectNew.estimate", { concepts: conceptCount, variants: variantCount, total: conceptCount * variantCount })}{" "}
              <span className="font-medium text-ink-700">{t("projectNew.deductOnce")}</span>
              <span className="ml-1 text-[10px] text-ink-500">
                {t("projectNew.flatFee")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                disabled={!name || !requirements}
              >
                {t("projectNew.start")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                loading={drafting}
                disabled={submitting}
                onClick={handleDraftSave}
              >
                {t("projectNew.saveDraft")}
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
        title={notifyDone ? t("projectNew.notifyDoneTitle") : t("projectNew.notifyModalTitle")}
        description={
          notifyDone
            ? t("projectNew.notifyDoneBody")
            : t("projectNew.notifyModalBody", { platform: notifyPlatform ?? "" })
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
              {t("common.close")}
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
                      title: t("projectNew.notifyFeedbackTitle", { platform: notifyPlatform ?? "" }),
                      body: t("projectNew.notifyFeedbackBody", { platform: notifyPlatform ?? "" }),
                    });
                    setNotifyDone(true);
                  } finally {
                    setNotifyBusy(false);
                  }
                }}
              >
                {t("projectNew.notifySubmit")}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-xs text-ink-600">
          {notifyDone
            ? t("projectNew.notifyDoneHint")
            : t("projectNew.notifyHint")}
        </p>
      </Modal>
    </div>
  );
}
