import type { SyntheticCompany } from "../../synthetic-types";
import { generateClutter, generateActivitySignals } from "../generator";
import { TALLYO_EMPLOYEES, TALLYO_CONNECTORS, TALLYO_COMPANIES, TALLYO_CONTACTS, TALLYO_DEALS, TALLYO_INVOICES, TALLYO_SLACK_CHANNELS, TALLYO_PROFILE, TALLYO_CLUTTER_CONFIG } from "./profile";
import { TALLYO_STORIES } from "./stories";
import { TALLYO_CONTRADICTIONS } from "./contradictions";

const clutter = generateClutter(TALLYO_PROFILE, TALLYO_CLUTTER_CONFIG);
const activitySignals = generateActivitySignals(TALLYO_PROFILE, { daysBack: 90, weekendActivity: false });

const TALLYO: SyntheticCompany = {
  slug: "tallyo",
  name: "Tallyo ApS",
  industry: "B2B SaaS — Project Management",
  domain: "tallyo.dk",
  employees: TALLYO_EMPLOYEES,
  connectors: TALLYO_CONNECTORS,
  companies: TALLYO_COMPANIES,
  contacts: TALLYO_CONTACTS,
  deals: TALLYO_DEALS,
  invoices: TALLYO_INVOICES,
  content: [...TALLYO_STORIES, ...TALLYO_CONTRADICTIONS, ...clutter],
  activitySignals,
  slackChannels: TALLYO_SLACK_CHANNELS,
};

export default TALLYO;
