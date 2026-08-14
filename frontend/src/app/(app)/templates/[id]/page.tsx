import { ROUTE_ID_SENTINEL } from "@/lib/route-sentinel";
import TemplateDetailClient from "./TemplateDetailClient";

export function generateStaticParams() {
  return [{ id: ROUTE_ID_SENTINEL }];
}

export default function TemplateDetailPage() {
  return <TemplateDetailClient />;
}
