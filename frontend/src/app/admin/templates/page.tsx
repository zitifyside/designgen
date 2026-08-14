"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import type { Template, TemplateStatus } from "@/lib/types";

type Filter = "all" | TemplateStatus;

const LABEL: Record<TemplateStatus, string> = {
  Pending: "심사 대기",
  Approved: "게시 중",
  Rejected: "거부됨",
  RequestChanges: "수정 요청",
};

const TONE: Record<TemplateStatus, "warning" | "success" | "danger" | "neutral"> =
  {
    Pending: "warning",
    Approved: "success",
    Rejected: "danger",
    RequestChanges: "neutral",
  };

export default function AdminTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [target, setTarget] = useState<Template | null>(null);
  const [decision, setDecision] = useState<TemplateStatus>("Approved");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(
        await api.admin.templates({
          status: filter === "all" ? undefined : filter,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿을 불러오지 못했다.");
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async () => {
    if (!target) return;
    if (decision !== "Approved" && !reason.trim()) {
      setError("거부·수정 요청은 사유 입력이 필수다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.admin.moderateTemplate(target.id, decision, reason.trim());
      setTarget(null);
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리에 실패했다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="템플릿 심사"
        description="마켓 등록 요청을 검토한다. 승인 시 즉시 게시된다."
        action={
          <Tabs
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { value: "Pending", label: "대기" },
              { value: "Approved", label: "게시" },
              { value: "Rejected", label: "거부" },
              { value: "all", label: "전체" },
            ]}
          />
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card padded={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">작성자</th>
              <th className="px-4 py-3 font-medium">카테고리</th>
              <th className="px-4 py-3 font-medium">가격</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">등록</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-ink-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">{t.name}</div>
                  <div className="text-[10px] text-ink-500">{t.description}</div>
                </td>
                <td className="px-4 py-3 text-ink-600">{t.authorName}</td>
                <td className="px-4 py-3 text-ink-600">{t.category}</td>
                <td className="px-4 py-3">
                  {t.price === 0 ? "무료" : `$${t.price}`}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[t.status]}>{LABEL[t.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(t);
                        setDecision("Approved");
                      }}
                    >
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget(t);
                        setDecision("Rejected");
                      }}
                    >
                      거부
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTarget(t);
                        setDecision("RequestChanges");
                      }}
                    >
                      수정 요청
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">
                  해당 상태의 템플릿이 없다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`템플릿 ${LABEL[decision]}`}
        description="처리 결과는 작성자에게 인앱 알림으로 통지된다."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              취소
            </Button>
            <Button size="sm" loading={busy} onClick={() => void moderate()}>
              확인
            </Button>
          </div>
        }
      >
        <div className="mb-3 text-xs text-ink-600">
          대상: <b>{target?.name}</b>
        </div>
        <Textarea
          label={decision === "Approved" ? "메모 (선택)" : "사유 (필수)"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          countMax={500}
          maxLength={500}
        />
      </Modal>
    </div>
  );
}
