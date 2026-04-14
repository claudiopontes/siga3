import Calendar from "@/components/calendar/Calendar";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Agenda | Varadouro Digital",
  description: "Agenda de compromissos — Varadouro Digital TCE-AC",
};
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Agenda" />
      <Calendar />
    </div>
  );
}
