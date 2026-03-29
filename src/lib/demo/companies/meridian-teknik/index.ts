import type { SyntheticCompany } from "../../synthetic-types";
import { generateClutter, generateActivitySignals } from "../generator";
import { MERIDIAN_EMPLOYEES, MERIDIAN_CONNECTORS, MERIDIAN_COMPANIES, MERIDIAN_CONTACTS, MERIDIAN_DEALS, MERIDIAN_INVOICES, MERIDIAN_SLACK_CHANNELS, MERIDIAN_PROFILE, MERIDIAN_CLUTTER_CONFIG } from "./profile";
import { MERIDIAN_STORIES } from "./stories";
import { MERIDIAN_CONTRADICTIONS } from "./contradictions";

const clutter = generateClutter(MERIDIAN_PROFILE, MERIDIAN_CLUTTER_CONFIG);
const activitySignals = generateActivitySignals(MERIDIAN_PROFILE, { daysBack: 90, weekendActivity: false });

const MERIDIAN: SyntheticCompany = {
  slug: "meridian-teknik",
  name: "Meridian Teknik A/S",
  industry: "Industrial Components Manufacturing",
  domain: "meridian-teknik.dk",
  employees: MERIDIAN_EMPLOYEES,
  connectors: MERIDIAN_CONNECTORS,
  companies: MERIDIAN_COMPANIES,
  contacts: MERIDIAN_CONTACTS,
  deals: MERIDIAN_DEALS,
  invoices: MERIDIAN_INVOICES,
  content: [...MERIDIAN_STORIES, ...MERIDIAN_CONTRADICTIONS, ...clutter],
  activitySignals,
  slackChannels: MERIDIAN_SLACK_CHANNELS,
};

export default MERIDIAN;
