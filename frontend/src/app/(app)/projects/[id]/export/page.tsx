import { ROUTE_ID_SENTINEL } from "@/lib/route-sentinel";
import ExportClient from "./ExportClient";

export function generateStaticParams() {
  return [{ id: ROUTE_ID_SENTINEL }];
}

export default function ProjectExportPage() {
  return <ExportClient />;
}
